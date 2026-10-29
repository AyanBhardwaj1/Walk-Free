import { useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, MapPin, X } from "lucide-react";
import { rankDestinations, type Destination } from "../lib/destinations";
import { googleMapsSearch } from "../lib/google-maps";

const MAX_RESULTS = 8;

/**
 * A From/To field: type any building, street or code (GDC, Andrews Hall) and
 * pick from ranked results. Off-map places link to Google Maps.
 */
export default function PlaceField({
  label,
  catalog,
  value,
  disabled,
  areaName,
  onChange,
}: {
  label: "From" | "To";
  catalog: Destination[];
  value: string;
  disabled: boolean;
  areaName: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const current = catalog.find((d) => d.id === value);
  const results = useMemo(
    () =>
      query.trim()
        ? rankDestinations(catalog, query).slice(0, MAX_RESULTS)
        : [],
    [catalog, query],
  );
  function choose(d: Destination) {
    onChange(d.id);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  }
  return (
    <div className={`place-field${open && query ? " open" : ""}`}>
      <span className="place-field-label">{label}</span>
      <div className="place-field-box">
        <MapPin size={15} aria-hidden />
        <input
          ref={input}
          role="combobox"
          aria-label={label === "From" ? "Starting point" : "Destination"}
          aria-expanded={open && !!query}
          aria-controls={listId}
          aria-activedescendant={
            results[active] ? `${listId}-${active}` : undefined
          }
          placeholder={
            current ? current.label : "Search a building, street or code…"
          }
          value={open ? query : (current?.label ?? "")}
          disabled={disabled || !catalog.length}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") input.current?.blur();
          }}
        />
        {open && query && (
          <button
            type="button"
            className="place-field-clear"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && query.trim() && (
        <ul className="place-results" role="listbox" id={listId}>
          {results.map((d, i) => (
            <li
              key={d.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(d)}
            >
              <strong>{d.label}</strong>
              <small>{d.detail}</small>
            </li>
          ))}
          {!results.length && (
            <li className="place-results-empty">
              Not on this map.{" "}
              <a
                href={googleMapsSearch(`${query} ${areaName}`)}
                target="_blank"
                rel="noreferrer"
                onMouseDown={(e) => e.preventDefault()}
              >
                Search “{query}” in Google Maps <ArrowUpRight size={12} />
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
