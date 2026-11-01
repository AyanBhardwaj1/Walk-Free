import { useEffect, useRef, useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";

/** Shows a written proposal to copy, download or share. */
export default function ProposalDialog({
  proposal,
  onClose,
}: {
  proposal: { title: string; text: string } | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (proposal && !d.open) {
      d.showModal();
      // The dialog focuses the text; start reading from the top.
      const t = textArea.current;
      if (t) {
        t.setSelectionRange(0, 0);
        t.scrollTop = 0;
      }
    }
    if (!proposal && d.open) d.close();
    setNote("");
  }, [proposal]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(proposal!.text);
      setNote("Copied. Paste it into an email or a planning comment.");
    } catch {
      setNote("Copying isn't allowed here; select the text and copy it.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([proposal!.text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${proposal!.title.replace(/[^\w-]+/g, "-").toLowerCase()}.txt`;
    a.click();
    // Some browsers start the download after this tick.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  return (
    <dialog
      ref={dialog}
      className="shortcuts proposal-dialog"
      aria-labelledby="proposal-title"
      onClose={onClose}
    >
      <h2 id="proposal-title">{proposal?.title ?? "Proposal"}</h2>
      <textarea
        ref={textArea}
        className="proposal-text"
        readOnly
        aria-label="Proposal text"
        value={proposal?.text ?? ""}
        rows={14}
      />
      <p className="fine" role="status">
        {note}
      </p>
      <div className="proposal-actions">
        <button className="secondary" onClick={() => void copy()}>
          <Copy size={15} aria-hidden /> Copy
        </button>
        <button className="secondary" onClick={download}>
          <Download size={15} aria-hidden /> Download
        </button>
        {canShare && (
          <button
            className="secondary"
            onClick={() =>
              void navigator
                .share({ title: proposal!.title, text: proposal!.text })
                .catch(() => {})
            }
          >
            <Share2 size={15} aria-hidden /> Share
          </button>
        )}
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
