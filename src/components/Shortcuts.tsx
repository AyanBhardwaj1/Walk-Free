import { useEffect, useRef } from "react";

export const SHORTCUTS: [key: string, action: string][] = [
  ["/", "Search places, buildings or cities"],
  ["P", "Play or pause the day"],
  ["S", "Switch interface style"],
  ["V", "Switch between the 3D and flat map"],
  ["?", "Show these shortcuts"],
];

const STORAGE_KEY = "walk-free-shortcuts";
/** Single-key shortcuts are on unless the person turned them off. */
export function loadShortcutsOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}
function saveShortcutsOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* The choice still applies for this visit. */
  }
}

/**
 * The keyboard shortcuts, in a native dialog (Escape closes it), with a
 * switch to turn single-key shortcuts off (WCAG 2.1.4): they can clash with
 * speech input and other assistive tools.
 */
export default function Shortcuts({
  open,
  onClose,
  enabled,
  onEnabled,
}: {
  open: boolean;
  onClose: () => void;
  enabled: boolean;
  onEnabled: (on: boolean) => void;
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
      <label className="check shortcuts-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            saveShortcutsOn(e.target.checked);
            onEnabled(e.target.checked);
          }}
        />
        Use single-key shortcuts
      </label>
      <button className="secondary" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}

/**
 * True when a key press belongs to a text field, an open dialog or a browser
 * shortcut. (Focus can stay on a closed dialog's control; that still counts
 * as the page.)
 */
export function ignoreShortcut(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    !!t?.closest(
      "input, textarea, select, [contenteditable='true'], dialog[open]",
    )
  );
}
