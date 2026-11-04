import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { ServiceError } from "../shared/errors";

const requestJson = vi.fn();
const requestBytes = vi.fn();
vi.mock("../server/network.js", async (original) => ({
  ...(await original<typeof import("../server/network")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
  requestBytes: (...args: unknown[]) => requestBytes(...args),
}));
const { memoryUsage, setUsageStore } = await import("../server/ai");
const { agentRouter, guestSegment } = await import("../server/agent");
const { coverage, sseEvents } = await import("../server/segment");

afterEach(() => {
  requestJson.mockReset();
  requestBytes.mockReset();
  vi.unstubAllEnvs();
  setUsageStore(null);
});

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((_q, r, next) => {
    r.locals.account = { id: "walker-1", emailVerified: true };
    next();
  });
  app.use("/api/agent", agentRouter);
  app.post("/api/guest/segment", guestSegment);
  app.use(
    (
      e: unknown,
      _q: express.Request,
      r: express.Response,
      _n: express.NextFunction,
    ) => {
      r.status(e instanceof ServiceError ? e.status : 400).json({
        error: e instanceof Error ? e.message : "error",
        code: e instanceof ServiceError ? e.code : undefined,
      });
    },
  );
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

const metaKey = {
  "x-walk-free-ai-key": "meta-user-own-key-123",
  "x-walk-free-ai-provider": "meta-model",
  "x-walk-free-ai-model": "muse-spark-1.3",
};
const openAiKey = {
  "x-walk-free-ai-key": "sk-user-own-key-123",
  "x-walk-free-ai-provider": "openai",
  "x-walk-free-ai-model": "gpt-5-mini",
};
const context = {
  area: "UT Austin, TX",
  localTime: "Wed 3:00 PM",
  weather: "97°F, 30% humidity",
  canBuildAreas: true,
};

// Two objects on a 320×334 frame, in SAM 3.1's output format (from Meta's
// parser documentation).
const SAM_TEXT =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n";
function sse(text: string) {
  const event = (e: object) =>
    `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`;
  const split = text.indexOf(",1<|box");
  return new TextEncoder().encode(
    event({ type: "response.created" }) +
      event({
        type: "response.output_text.delta",
        item_id: "m",
        output_index: 0,
        content_index: 0,
        delta: text.slice(0, split),
      }) +
      event({
        type: "response.output_text.delta",
        item_id: "m",
        output_index: 0,
        content_index: 0,
        delta: text.slice(split),
      }) +
      event({
        type: "response.output_text.done",
        item_id: "m",
        output_index: 0,
        content_index: 0,
        text,
      }) +
      event({ type: "response.completed" }) +
      "data: [DONE]\n\n",
  );
}
const photo = {
  image: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
  width: 320,
  height: 334,
};

describe("street photo check with SAM 3.1", () => {
  it("reads server-sent events and skips the end marker", () => {
    const events = sseEvents(new TextDecoder().decode(sse(SAM_TEXT)));
    expect(events.map((e) => e.type)).toEqual([
      "response.created",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.output_text.done",
      "response.completed",
    ]);
  });

  it("counts overlapping masks once and keeps them inside the photo", () => {
    const full = { raster: new Uint8Array(4).fill(1), width: 2 };
    const result = coverage(
      [
        { ...full, bounds: { left: 0, top: 0, right: 2, bottom: 2 } },
        { ...full, bounds: { left: 1, top: 1, right: 3, bottom: 3 } },
        // Hangs off the bottom-right corner: only one pixel is inside.
        { ...full, bounds: { left: 3, top: 3, right: 5, bottom: 5 } },
      ],
      4,
      4,
      4,
    );
    expect(result.share).toBeCloseTo(8 / 16);
    expect(result.rows).toBe(4);
    const bits = Buffer.from(result.grid, "base64");
    const on = (x: number, y: number) =>
      (bits[(y * 4 + x) >> 3] >> ((y * 4 + x) & 7)) & 1;
    expect(on(0, 0)).toBe(1);
    expect(on(2, 2)).toBe(1);
    expect(on(3, 3)).toBe(1);
    expect(on(3, 0)).toBe(0);
  });

  it("asks SAM 3.1 for trees, pavement and sky and reports each share", async () => {
    setUsageStore(memoryUsage());
    requestBytes.mockImplementation(async () => sse(SAM_TEXT));
    const result = await post("/api/agent/segment", photo, metaKey);
    expect(result.status).toBe(200);
    expect(result.body.model).toBe("sam-3.1");
    expect(
      result.body.concepts.map((c: { concept: string }) => c.concept),
    ).toEqual(["tree", "pavement", "sky"]);
    const tree = result.body.concepts[0];
    expect(tree.objects).toBe(4);
    // "tree" and "foliage" found the same two objects: 1,539 + 1,236 pixels,
    // counted once, on a 320×334 photo.
    expect(tree.share).toBeCloseTo((1539 + 1236) / (320 * 334), 4);
    expect(requestBytes).toHaveBeenCalledTimes(4);
    const [url, options] = requestBytes.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("sam-3.1");
    expect(body.stream).toBe(true);
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "tree" },
      { type: "input_image", image_url: photo.image },
    ]);
  });

  it("reports no matches as zero, not an error", async () => {
    setUsageStore(memoryUsage());
    requestBytes.mockImplementation(async () =>
      new TextEncoder().encode(
        `data: ${JSON.stringify({ type: "response.completed" })}\n\n`,
      ),
    );
    const result = await post("/api/agent/segment", photo, metaKey);
    expect(result.status).toBe(200);
    expect(
      result.body.concepts.every((c: { share: number }) => c.share === 0),
    ).toBe(true);
  });

  it("explains that photo checks need Meta's Model API, and charges nothing", async () => {
    vi.stubEnv("WALK_FREE_AI_OWN_KEY_DAILY_LIMIT", "1");
    setUsageStore(memoryUsage());
    const result = await post("/api/agent/segment", photo, openAiKey);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AI_SEGMENT_PROVIDER");
    expect(requestBytes).not.toHaveBeenCalled();
  });

  it("turns a rejected key into guidance", async () => {
    setUsageStore(memoryUsage());
    requestBytes.mockRejectedValue(
      new ServiceError(
        "UPSTREAM_UNAVAILABLE",
        "The data provider returned HTTP 401. Please try again later.",
        502,
      ),
    );
    const result = await post("/api/agent/segment", photo, metaKey);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AI_KEY_REJECTED");
  });

  it("refuses anything but a JPEG or PNG data URL", async () => {
    const result = await post(
      "/api/agent/segment",
      { ...photo, image: "https://example.com/street.jpg" },
      metaKey,
    );
    expect(result.status).toBe(400);
    expect(requestBytes).not.toHaveBeenCalled();
  });

  it("lets guests check a photo on the site's Meta key within the guest caps", async () => {
    vi.stubEnv("WALK_FREE_AI_API_KEY", "meta-site-key-123");
    vi.stubEnv("WALK_FREE_AI_BASE_URL", "https://api.meta.ai/v1");
    vi.stubEnv("WALK_FREE_GUEST_AI_PER_VISITOR", "1");
    setUsageStore(memoryUsage());
    requestBytes.mockImplementation(async () => sse(SAM_TEXT));
    expect((await post("/api/guest/segment", photo)).status).toBe(200);
    const second = await post("/api/guest/segment", photo);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("AI_GUEST_LIMIT");
  });
});

describe("thinking deeper with Muse Wonder", () => {
  const ask = (headers: Record<string, string>) =>
    post(
      "/api/agent/chat",
      {
        messages: [{ role: "user", content: "Plan my whole day in shade" }],
        context,
        deep: true,
      },
      headers,
    );

  it("asks Muse Wonder on the same Meta key and counts two calls", async () => {
    vi.stubEnv("WALK_FREE_AI_OWN_KEY_DAILY_LIMIT", "2");
    setUsageStore(memoryUsage());
    requestJson.mockResolvedValue({
      choices: [{ message: { content: "Leave at 8 AM." } }],
    });
    const first = await ask(metaKey);
    expect(first.status).toBe(200);
    expect(first.body.model).toBe("muse-wonder-1.0");
    const [url, options] = requestJson.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(url).toBe("https://api.meta.ai/v1/chat/completions");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("muse-wonder-1.0");
    expect(body.max_tokens).toBe(8000);
    expect(body.tools.length).toBeGreaterThan(0);
    // Both of today's two calls went to that one answer.
    expect((await ask(metaKey)).body.code).toBe("AI_DAILY_LIMIT");
  });

  it("keeps the usual model when deep isn't asked for", async () => {
    setUsageStore(memoryUsage());
    requestJson.mockResolvedValue({
      choices: [{ message: { content: "Speedway." } }],
    });
    const result = await post(
      "/api/agent/chat",
      { messages: [{ role: "user", content: "Hottest?" }], context },
      metaKey,
    );
    expect(result.body.model).toBe("muse-spark-1.3");
  });

  it("explains that Muse Wonder needs Meta's Model API, and charges nothing", async () => {
    vi.stubEnv("WALK_FREE_AI_OWN_KEY_DAILY_LIMIT", "1");
    setUsageStore(memoryUsage());
    const result = await ask(openAiKey);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AI_DEEP_PROVIDER");
    expect(requestJson).not.toHaveBeenCalled();
    requestJson.mockResolvedValue({
      choices: [{ message: { content: "Speedway." } }],
    });
    const plain = await post(
      "/api/agent/chat",
      { messages: [{ role: "user", content: "Hottest?" }], context },
      openAiKey,
    );
    expect(plain.status).toBe(200);
  });
});
