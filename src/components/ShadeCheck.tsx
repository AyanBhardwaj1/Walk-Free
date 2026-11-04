import { useRef, useState } from "react";
import { Camera, ScanSearch, Sprout } from "lucide-react";

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Found {
  trees: Box[];
  awnings: Box[];
}

/** The longest side sent to SAM; enough to find trees, small to upload. */
const MAX_SIDE = 1024;

/** A photo as a JPEG data URL no larger than MAX_SIDE on its long side. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * Shade check: snap or pick a street photo and Meta's SAM 3.1 finds the
 * trees and awnings in it. A street with none links to the tree planner.
 */
export default function ShadeCheck({
  check,
  onPlan,
}: {
  check: (image: string) => Promise<Found>;
  /** Opens "Where should the next trees go?". */
  onPlan: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setFound(null);
    setBusy(true);
    try {
      const image = await shrink(file);
      setPhoto(image);
      setFound(await check(image));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't check this photo. Try again.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const shade = found ? found.trees.length + found.awnings.length : 0;
  return (
    <section className="shade-check" aria-labelledby="shade-check-title">
      <div className="section-title" id="shade-check-title">
        <ScanSearch size={17} aria-hidden /> Check a street photo
      </div>
      <p className="intro-small">
        Snap a sunny walk and Meta&apos;s SAM 3.1 finds the trees and awnings in
        it, so a missing-shade spot can go straight into a planting plan.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <button
        className="secondary"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-busy={busy}
      >
        <Camera size={15} aria-hidden />
        {busy ? "SAM 3.1 is looking…" : "Take or choose a photo"}
      </button>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      {photo && (
        <figure className="shade-photo">
          <img src={photo} alt="The street you checked" />
          {found?.trees.map((b, i) => (
            <span key={`t${i}`} className="shade-box tree" style={place(b)} />
          ))}
          {found?.awnings.map((b, i) => (
            <span key={`a${i}`} className="shade-box awning" style={place(b)} />
          ))}
        </figure>
      )}
      {found && (
        <div className="shade-result" role="status">
          <p>
            SAM 3.1 found <strong>{count(found.trees.length, "tree")}</strong>{" "}
            and <strong>{count(found.awnings.length, "awning")}</strong>.
            {shade === 0
              ? " Nothing here casts shade on the walk."
              : shade < 3
                ? " A little shade, with gaps between."
                : " Plenty to walk under."}
          </p>
          {shade < 3 && (
            <button className="text-button" onClick={onPlan}>
              <Sprout size={13} aria-hidden /> See where trees would help most
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const count = (n: number, word: string) =>
  `${n === 0 ? "no" : n} ${word}${n === 1 ? "" : "s"}`;
const place = (b: Box) => ({
  left: `${b.x1 * 100}%`,
  top: `${b.y1 * 100}%`,
  width: `${(b.x2 - b.x1) * 100}%`,
  height: `${(b.y2 - b.y1) * 100}%`,
});
