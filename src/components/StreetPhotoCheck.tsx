import { useEffect, useRef, useState } from "react";
import { Camera, ScanEye } from "lucide-react";
import { friendlyError } from "../lib/errors";

export interface PhotoConceptResult {
  concept: "tree" | "pavement" | "sky";
  share: number;
  objects: number;
  /** Base64 bits, row-major over cols × rows. */
  grid: string;
}
export interface PhotoCheckResult {
  model: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  concepts: PhotoConceptResult[];
}
export interface PhotoToCheck {
  image: string;
  width: number;
  height: number;
}

const COLORS = {
  sky: "rgba(245, 190, 40, 0.45)",
  tree: "rgba(40, 150, 70, 0.5)",
  sun: "rgba(225, 80, 40, 0.45)",
  shade: "rgba(50, 70, 180, 0.5)",
  /** Ground with no sun-and-shade contrast to split. */
  even: "rgba(120, 120, 110, 0.45)",
};
const percent = (x: number) => `${Math.round(x * 100)}%`;

/** A photo from the camera or library as a JPEG up to 1024 px on its long side. */
export async function shrinkPhoto(file: Blob): Promise<PhotoToCheck> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(16, Math.round(img.naturalWidth * k));
    c.height = Math.max(16, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare the photo.");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return {
      image: c.toDataURL("image/jpeg", 0.85),
      width: c.width,
      height: c.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Whether cell `i` of a base64 bit grid is set. */
export function gridBit(bytes: Uint8Array, i: number) {
  return ((bytes[i >> 3] ?? 0) >> (i & 7)) & 1;
}
function decodeGrid(grid: string) {
  return Uint8Array.from(atob(grid), (ch) => ch.charCodeAt(0));
}

/**
 * Which cells of the paved ground are in shade, from their brightness: a cell
 * well below the sunlit ground's brightness (its 85th percentile) is shaded.
 * Null when too little ground is visible to tell.
 */
export function shadedGround(brightness: number[]) {
  if (brightness.length < 8) return null;
  const sorted = [...brightness].sort((a, b) => a - b);
  const sunlit = sorted[Math.floor(sorted.length * 0.85)];
  // Evenly lit ground (overcast, or all in shade) has no contrast to split.
  if (sorted[Math.floor(sorted.length * 0.15)] > sunlit * 0.8)
    return { shaded: brightness.map(() => false), share: 0, even: true };
  const shaded = brightness.map((b) => b < sunlit * 0.72);
  return {
    shaded,
    share: shaded.filter(Boolean).length / shaded.length,
    even: false,
  };
}

interface Ground {
  share: number | null;
  even: boolean;
}

/**
 * Checks a street against a real photo: Meta's SAM 3.1 finds the tree
 * canopy, the paved ground and the open sky in it, and the ground is split
 * into sun and shade by brightness, drawn over the picture beside the
 * model's shade for the same street.
 */
export default function StreetPhotoCheck({
  place,
  modelShade,
  onCheck,
  onClose,
  onPlanTrees,
}: {
  /** Opens "Where should the next trees go?" in the Design studio. */
  onPlanTrees?: () => void;
  /** The street or park being checked; null closes the dialog. */
  place: string | null;
  /** The model's shaded share of it at the hour shown, 0 to 1. */
  modelShade: number | null;
  onCheck: (photo: PhotoToCheck) => Promise<PhotoCheckResult>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<PhotoToCheck | null>(null);
  const [result, setResult] = useState<PhotoCheckResult | null>(null);
  const [ground, setGround] = useState<Ground | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (place && !d.open) d.showModal();
    if (!place && d.open) d.close();
    if (!place) {
      setPhoto(null);
      setResult(null);
      setGround(null);
      setError("");
    }
  }, [place]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !photo) return;
    let live = true;
    const img = new Image();
    img.src = photo.image;
    void img.decode().then(() => {
      if (!live) return;
      c.width = photo.width;
      c.height = photo.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      if (!result) return;
      const { cols, rows } = result;
      const cw = photo.width / cols,
        ch = photo.height / rows;
      const layer = (concept: PhotoConceptResult["concept"]) => {
        const found = result.concepts.find((x) => x.concept === concept);
        return found ? decodeGrid(found.grid) : new Uint8Array();
      };
      const paint = (i: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(
          (i % cols) * cw,
          Math.floor(i / cols) * ch,
          Math.ceil(cw),
          Math.ceil(ch),
        );
      };
      // Each ground cell's brightness, read before anything is drawn over it.
      const pixels = ctx.getImageData(0, 0, photo.width, photo.height).data;
      const pavement = layer("pavement");
      const cells: number[] = [],
        brightness: number[] = [];
      for (let i = 0; i < cols * rows; i++) {
        if (!gridBit(pavement, i)) continue;
        const x0 = Math.floor((i % cols) * cw),
          y0 = Math.floor(Math.floor(i / cols) * ch);
        let sum = 0,
          n = 0;
        for (let y = y0; y < Math.min(photo.height, y0 + ch); y += 2)
          for (let x = x0; x < Math.min(photo.width, x0 + cw); x += 2) {
            const p = (y * photo.width + x) * 4;
            sum +=
              0.2126 * pixels[p] +
              0.7152 * pixels[p + 1] +
              0.0722 * pixels[p + 2];
            n++;
          }
        if (!n) continue;
        cells.push(i);
        brightness.push(sum / n);
      }
      const split = shadedGround(brightness);
      const sky = layer("sky"),
        tree = layer("tree");
      for (let i = 0; i < cols * rows; i++) {
        if (gridBit(sky, i)) paint(i, COLORS.sky);
        if (gridBit(tree, i)) paint(i, COLORS.tree);
      }
      cells.forEach((i, k) =>
        paint(
          i,
          split?.even
            ? COLORS.even
            : split?.shaded[k]
              ? COLORS.shade
              : COLORS.sun,
        ),
      );
      setGround({ share: split?.share ?? null, even: split?.even ?? false });
    });
    return () => {
      live = false;
    };
  }, [photo, result]);
  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    setResult(null);
    setGround(null);
    setBusy(true);
    try {
      const next = await shrinkPhoto(file);
      setPhoto(next);
      setResult(await onCheck(next));
    } catch (e) {
      setError(friendlyError(e, "SAM 3.1 couldn't read this photo."));
    } finally {
      setBusy(false);
    }
  }
  const share = (concept: PhotoConceptResult["concept"]) =>
    result?.concepts.find((x) => x.concept === concept)?.share ?? 0;
  const groundShade = ground?.share ?? null;
  return (
    <dialog
      ref={dialog}
      className="shortcuts render-dialog photo-check"
      aria-labelledby="photo-check-title"
      onClose={onClose}
    >
      <h2 id="photo-check-title">
        <ScanEye size={18} aria-hidden /> Check {place ?? "this street"} with a
        photo
      </h2>
      <p className="intro-small">
        Take or choose a photo looking along the walk. Meta&apos;s SAM 3.1 finds
        the tree canopy, the paved ground and the open sky in it, and the ground
        is split into sun and shade, so you can see how the street really looks
        next to the model.
      </p>
      <label className={`secondary file-button${busy ? " is-busy" : ""}`}>
        <Camera size={15} aria-hidden />{" "}
        {photo ? "Use another photo" : "Take or choose a photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/heic,image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {photo && (
        <figure className={busy ? "is-busy" : ""}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={
              result
                ? `The photo with ${percent(share("tree"))} tree canopy, ${percent(share("pavement"))} paved ground and ${percent(share("sky"))} open sky marked`
                : "The photo being checked"
            }
          />
          {busy && (
            <div className="render-wait" role="status">
              <span className="city-gen-spinner" aria-hidden />
              SAM 3.1 is reading the photo…
            </div>
          )}
        </figure>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <ul className="photo-check-legend">
            <li>
              <span className="heat-dot" style={{ background: COLORS.tree }} />
              Tree canopy <strong>{percent(share("tree"))}</strong>
            </li>
            <li>
              <span className="heat-dot" style={{ background: COLORS.sky }} />
              Open sky <strong>{percent(share("sky"))}</strong>
            </li>
            <li>
              <span className="heat-dot" style={{ background: COLORS.sun }} />
              <span className="heat-dot" style={{ background: COLORS.shade }} />
              <span>
                Paved ground <strong>{percent(share("pavement"))}</strong>
                {groundShade !== null &&
                  !ground?.even &&
                  `, ${percent(groundShade)} of it in shade`}
              </span>
            </li>
          </ul>
          <p>
            {modelShade !== null &&
              `The model has ${place} ${percent(modelShade)} shaded at the hour shown. `}
            {ground?.even
              ? "The ground is evenly lit in this photo (overcast or all in shade), so it shows no sun-and-shade pattern. "
              : groundShade !== null
                ? `In the photo, ${percent(groundShade)} of the paved ground is in shade. `
                : ""}
            {share("sky") > 0.3
              ? "Much of this view is open sky, so the sun reaches the walk for long stretches of the day."
              : share("tree") > 0.2
                ? "Trees fill a good part of this view, which keeps the walk shaded for more of the day."
                : "Little canopy here: a candidate for planting shade trees in the Design studio."}
          </p>
        </>
      )}
      <p className="fine">
        Shares are of the whole photo at the moment it was taken; shade on the
        ground is judged from brightness. The model&apos;s shade is for the hour
        on the slider. Photos are sent to Meta&apos;s Model API for this check
        only and aren&apos;t stored by Walk-Free.
      </p>
      <div className="proposal-actions">
        {result && onPlanTrees && share("tree") <= 0.2 && (
          <button className="secondary" onClick={onPlanTrees}>
            See where trees would help most
          </button>
        )}
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
