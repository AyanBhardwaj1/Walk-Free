import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  detail?: ReactNode;
}

/**
 * An accessible, animated dropdown that matches the app instead of the
 * browser's native select: arrow keys move, Enter picks, Escape closes.
 */
export default function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "Choose…",
}: {
  label: string;
  value: T | "";
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function show() {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  }
  function pick(i: number) {
    const option = options[i];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }
  return (
    <div className={`select${open ? " open" : ""}`} ref={root}>
      <button
        type="button"
        className="select-trigger"
        // WAI-ARIA "select-only combobox": focus stays here and the
        // highlighted option is announced through aria-activedescendant.
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") setOpen(false);
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) show();
            else
              setActive((a) =>
                Math.min(
                  options.length - 1,
                  Math.max(0, a + (e.key === "ArrowDown" ? 1 : -1)),
                ),
              );
          } else if ((e.key === "Enter" || e.key === " ") && open) {
            e.preventDefault();
            pick(active);
          }
        }}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <span className={current ? "" : "placeholder"}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <ul
          className="select-menu"
          role="listbox"
          id={id}
          ref={list}
          aria-label={label}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              data-index={i}
              aria-selected={o.value === value}
              className={i === active ? "active" : ""}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span>
                {o.label}
                {o.detail && <small>{o.detail}</small>}
              </span>
              {o.value === value && <Check size={15} aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
