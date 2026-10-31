import { useEffect, useRef } from "react";

export const SHORTCUTS: [key: string, action: string][] = [
  ["/", "Search places, buildings or cities"],
  ["P", "Play or pause the day"],
  ["S", "Switch interface style"],
  ["V", "Switch between the 3D and flat map"],
  ["?", "Show these shortcuts"],
];

/** The keyboard shortcuts, in a native dialog (Escape closes it). */
export default function Shortcuts({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="shortcuts"
      aria-labelledby="shortcuts-title"
      onClose={onClose}
    >
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <dl>
        {SHORTCUTS.map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <button className="secondary" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}

/** True when a key press belongs to a text field or a browser shortcut. */
export function ignoreShortcut(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    !!t?.closest("input, textarea, select, [contenteditable='true'], dialog")
  );
}
