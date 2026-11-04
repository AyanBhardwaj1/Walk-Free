import {
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";
import { requestBytes, ServiceError } from "./network.js";
import { USER_AI_PROVIDERS, type AiConfig } from "./ai.js";

/** SAM 3.1, Meta's segmentation model, on the Meta Model API. */
export const SEGMENT_MODEL = () =>
  process.env.WALK_FREE_SEGMENT_MODEL || "sam-3.1";

/**
 * What a street photo is checked for. SAM 3.1 takes short noun phrases, not
 * questions; each phrase is one call. It finds objects, not cast shadows, so
 * it finds the paved ground and the browser splits that into sun and shade
 * by brightness.
 */
export const PHOTO_CONCEPTS = ["tree", "pavement", "sky"] as const;
export type PhotoConcept = (typeof PHOTO_CONCEPTS)[number];
/**
 * The phrases asked for each concept. "tree" finds whole trees and
 * "foliage" the leafy mass between them; together they cover the canopy.
 */
export const CONCEPT_PROMPTS: Record<PhotoConcept, string[]> = {
  tree: ["tree", "foliage"],
  pavement: ["pavement"],
  sky: ["sky"],
};

/** Columns of the coverage grid sent back for drawing the overlay. */
export const GRID_COLUMNS = 96;
/** All three calls run at once and must finish inside Vercel's 60 s limit. */
const SEGMENT_BUDGET_MS = 45_000;

/** SAM 3.1 runs only on the Meta Model API; checked before any charge. */
export function requireSegmentProvider(config: AiConfig) {
  if (config.baseUrl !== USER_AI_PROVIDERS["meta-model"])
    throw new ServiceError(
      "AI_SEGMENT_PROVIDER",
      config.own
        ? "Checking photos uses Meta's SAM 3.1: choose Meta Model API in AI settings."
        : "Checking photos needs the site's Meta Model API key.",
      400,
    );
}

/** Server-sent events from the Responses API, as parser events. */
export function sseEvents(text: string): ResponsesEvent[] {
  const events: ResponsesEvent[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as ResponsesEvent;
      if (event && typeof event.type === "string") events.push(event);
    } catch {
      /* A malformed line is skipped; the parser reports what's missing. */
    }
  }
  return events;
}

export interface ConceptCoverage {
  concept: PhotoConcept;
  /** Share of the photo's pixels covered by any match, 0 to 1. */
  share: number;
  /** How many separate matches SAM found. */
  objects: number;
  /** Base64 bits, row-major over `cols` × `rows`: 1 where a cell is mostly covered. */
  grid: string;
}

/**
 * Paints every mask into one picture-sized layer, so overlapping matches
 * count once, then shrinks it to a small grid for the overlay.
 */
export function coverage(
  masks: {
    bounds: { left: number; top: number; right: number; bottom: number };
    raster: Uint8Array;
    width: number;
  }[],
  width: number,
  height: number,
  cols = GRID_COLUMNS,
) {
  const layer = new Uint8Array(width * height);
  for (const { bounds, raster, width: w } of masks)
    for (let i = 0; i < raster.length; i++) {
      if (!raster[i]) continue;
      const x = bounds.left + (i % w);
      const y = bounds.top + Math.floor(i / w);
      if (x >= 0 && y >= 0 && x < width && y < height) layer[y * width + x] = 1;
    }
  let covered = 0;
  for (const v of layer) covered += v;
  const rows = Math.max(1, Math.round((height * cols) / width));
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * width) / cols),
        x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cols));
      const y0 = Math.floor((r * height) / rows),
        y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / rows));
      let on = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) on += layer[y * width + x];
      if (on * 2 >= (x1 - x0) * (y1 - y0)) {
        const i = r * cols + c;
        bits[i >> 3] |= 1 << (i & 7);
      }
    }
  return {
    share: width * height ? covered / (width * height) : 0,
    cols,
    rows,
    grid: Buffer.from(bits).toString("base64"),
  };
}

/** One SAM 3.1 call: every match of the noun phrase `concept` in the photo. */
async function segmentConcept(
  config: AiConfig,
  image: string,
  concept: string,
) {
  const bytes = await requestBytes(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    timeoutMs: SEGMENT_BUDGET_MS,
    maxBytes: 8_000_000,
    errorReason: config.own,
    body: JSON.stringify({
      model: SEGMENT_MODEL(),
      stream: true,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: concept },
            { type: "input_image", image_url: image },
          ],
        },
      ],
    }),
  });
  const events = sseEvents(Buffer.from(bytes).toString("utf8"));
  // No matches can mean no output text at all, which the parser refuses.
  if (
    events.some((e) => e.type === "response.completed") &&
    !events.some((e) => e.type.startsWith("response.output_text"))
  )
    return [];
  const parsed = parseImageStream(
    (async function* () {
      yield* events;
    })(),
  );
  for await (const snapshot of parsed) void snapshot;
  const result = await parsed.finalResult;
  if (result.outcome.status !== "completed")
    throw new ServiceError(
      "AI_SEGMENT_FAILED",
      "SAM 3.1 stopped before it finished reading the photo. Try again.",
      502,
    );
  return recordsOfKind(result.records, "mask").map((m) => ({
    bounds: m.bounds,
    raster: decodeMaskToRaster(m.mask),
    width: m.mask.width,
  }));
}

/**
 * Reads a street photo with SAM 3.1: how much of it is tree canopy, paved
 * ground and open sky. Returns each share and a small grid to draw over the photo.
 */
export async function segmentStreetPhoto(
  config: AiConfig,
  image: string,
  width: number,
  height: number,
) {
  requireSegmentProvider(config);
  const masks = await Promise.all(
    PHOTO_CONCEPTS.map(async (concept) =>
      (
        await Promise.all(
          CONCEPT_PROMPTS[concept].map((phrase) =>
            segmentConcept(config, image, phrase).catch((error: unknown) => {
              throw segmentFailure(config, error);
            }),
          ),
        )
      ).flat(),
    ),
  );
  let cols = GRID_COLUMNS,
    rows = 1;
  const concepts: ConceptCoverage[] = PHOTO_CONCEPTS.map((concept, i) => {
    const c = coverage(masks[i], width, height);
    cols = c.cols;
    rows = c.rows;
    return {
      concept,
      share: c.share,
      objects: masks[i].length,
      grid: c.grid,
    };
  });
  return { model: SEGMENT_MODEL(), width, height, cols, rows, concepts };
}

/** Provider errors as guidance about the key, in the image feature's words. */
function segmentFailure(config: AiConfig, error: unknown) {
  if (error instanceof ServiceError && error.code.startsWith("AI_"))
    return error;
  const status = Number(
    (error instanceof Error ? error.message : "").match(/HTTP (\d{3})/)?.[1],
  );
  const reason =
    config.own && error instanceof ServiceError && error.providerReason
      ? ` The provider said: “${error.providerReason}”`
      : "";
  if (status === 401 || (error as ServiceError)?.code === "NETWORK_BLOCKED")
    return new ServiceError(
      "AI_KEY_REJECTED",
      config.own
        ? `Meta rejected your key for SAM 3.1. Check it in AI settings.${reason}`
        : "The site's AI key was rejected for SAM 3.1. Please tell the site owner.",
      400,
    );
  if (status === 429)
    return new ServiceError(
      "AI_BUSY",
      `SAM 3.1 is busy or the account is out of credit. Try again in a moment.${reason}`,
      429,
    );
  if (status)
    return new ServiceError(
      "AI_SEGMENT_FAILED",
      `SAM 3.1 couldn't read this photo (HTTP ${status}).${reason}`,
      502,
    );
  return error;
}
