import { useEffect, useRef } from "react";
import { Download, Sparkles } from "lucide-react";

export interface PhotoRender {
  /** The 3D view the photo was made from. */
  before: string;
  /** Muse Image's photo, once it arrives. */
  after?: string;
  busy?: boolean;
  /** Why there's no photo (no key, provider error), in plain words. */
  note?: string;
  title: string;
}

/**
 * The planted street, before (the 3D model) and after (a photo rendered by
 * Meta's Muse Image from that view), for a proposal or a council email.
 */
export default function PhotoRenderDialog({
  render,
  onClose,
}: {
  render: PhotoRender | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (render && !d.open) d.showModal();
    if (!render && d.open) d.close();
  }, [render]);
  const save = () => {
    if (!render?.after) return;
    const a = document.createElement("a");
    a.href = render.after;
    a.download = `${render.title.replace(/[^\w-]+/g, "-").toLowerCase()}.png`;
    a.click();
  };
  return (
    <dialog
      ref={dialog}
      className="shortcuts render-dialog"
      aria-labelledby="render-title"
      onClose={onClose}
    >
      <h2 id="render-title">{render?.title ?? "See it planted"}</h2>
      <div className="render-pair">
        <figure>
          {render && (
            <img src={render.before} alt="The 3D model of the street" />
          )}
          <figcaption>The model</figcaption>
        </figure>
        <figure className={render?.busy ? "is-busy" : ""}>
          {render?.after ? (
            <img
              src={render.after}
              alt="A photo-like rendering of the street with the new trees"
            />
          ) : (
            <div className="render-wait" role="status">
              {render?.busy ? (
                <>
                  <span className="city-gen-spinner" aria-hidden />
                  Muse Image is rendering the street…
                </>
              ) : (
                (render?.note ?? "")
              )}
            </div>
          )}
          <figcaption>
            <Sparkles size={12} aria-hidden /> Rendered by Meta&apos;s Muse
            Image
          </figcaption>
        </figure>
      </div>
      <p className="fine">
        An illustration made from the 3D model to show the idea; the shade and
        heat numbers come from the model, not from this picture.
      </p>
      <div className="proposal-actions">
        <button className="secondary" onClick={save} disabled={!render?.after}>
          <Download size={15} aria-hidden /> Download the photo
        </button>
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
