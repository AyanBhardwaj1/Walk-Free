import { useEffect, useId, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import {
  THEMES,
  themeColor,
  type ColorRole,
  type ThemeName,
} from "../lib/theme";

/** Colours each swatch previews: paper, panel, accent and ink. */
const SWATCH: [string, ColorRole][] = [
  ["#f5f3ec", "bg"],
  ["#fffdf6", "bg"],
  ["#3f5938", "bg"],
  ["#313b30", "fg"],
];

/** A header button that opens the interface styles. */
export default function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    // Tabbing out of the picker closes it too.
    const leave = (e: FocusEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", leave);
    // Focus the chosen style so arrow keys work straight away.
    root.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("focusin", leave);
    };
  }, [open]);
  return (
    <div className="theme-picker" ref={root}>
      <button
        ref={button}
        className="icon-button"
        aria-label="Interface style"
        aria-expanded={open}
        aria-controls={menuId}
        title="Interface style (S)"
        onClick={() => setOpen(!open)}
      >
        <Palette size={18} aria-hidden />
      </button>
      {open && (
        <fieldset className="theme-menu" id={menuId}>
          <legend>Interface style</legend>
          {THEMES.map((t) => (
            <label key={t.name} className={t.name === value ? "chosen" : ""}>
              <input
                type="radio"
                name="walk-free-theme"
                value={t.name}
                checked={t.name === value}
                onChange={() => onChange(t.name)}
              />
              <span className="theme-swatch" aria-hidden>
                {SWATCH.map(([hex, role]) => (
                  <i
                    key={hex}
                    style={{ background: themeColor(hex, t.name, role) }}
                  />
                ))}
              </span>
              <span className="theme-text">
                <strong>{t.label}</strong>
                <small>{t.description}</small>
              </span>
              {t.name === value && <Check size={15} aria-hidden />}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
