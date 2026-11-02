import { useId, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import type { City } from "../../shared/types";
import { rankDestinations, type Destination } from "../lib/destinations";
import { searchCities } from "../../server/cities";
import { prebuiltAreaFor } from "../../shared/areas";
import { googleMapsSearch } from "../lib/google-maps";
import { FICTION_CITIES, type FictionCity } from "../lib/fiction-catalog";

type Result =
  | { kind: "place"; place: Destination }
  | { kind: "city"; city: City }
  | { kind: "fiction"; fiction: FictionCity };

/** Fictional cities whose name matches, or all of them for "fiction". */
export function matchFiction(query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  if ("fictional cities".startsWith(q) || q.startsWith("fiction"))
    return [...FICTION_CITIES];
  return FICTION_CITIES.filter(
    (c) =>
      c.name
        .toLowerCase()
        .split(" ")
        .some((word) => word.startsWith(q)) ||
      c.name.toLowerCase().startsWith(q),
  );
}
const PLACES = 5;
const CITIES = 4;

/**
 * One search for everything: places on the loaded map (walk there) and US
 * cities or campuses (open them), with Google Maps for anything else.
 */
export default function OmniSearch({
  catalog,
  areaName,
  onPlace,
  onCity,
  onFiction,
}: {
  catalog: Destination[];
  areaName: string;
  onPlace: (id: string) => void;
  onCity: (city: City) => void;
  /** Open a generated fictional city by its slug. */
  onFiction?: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo<Result[]>(() => {
    if (!query.trim()) return [];
    return [
      ...rankDestinations(catalog, query)
        .slice(0, PLACES)
        .map((place) => ({ kind: "place" as const, place })),
      ...searchCities(query.toLowerCase())
        .slice(0, CITIES)
        .map((city) => ({ kind: "city" as const, city })),
      ...(onFiction ? matchFiction(query) : []).map((fiction) => ({
        kind: "fiction" as const,
        fiction,
      })),
    ];
  }, [catalog, query, onFiction]);
  function choose(r: Result) {
    if (r.kind === "place") onPlace(r.place.id);
    else if (r.kind === "fiction") onFiction?.(r.fiction.slug);
    else onCity(r.city);
    setQuery("");
    input.current?.blur();
  }
  const open = focused && !!query.trim();
  return (
    <div className={`omni${open ? " open" : ""}`}>
      <div className="omni-box">
        <Search size={17} aria-hidden />
        <input
          ref={input}
          role="combobox"
          aria-label="Search places, buildings or cities"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[active] ? `${listId}-${active}` : undefined
          }
          placeholder="Search a building, street or city…"
          value={query}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
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
      </div>
      {open && (
        <ul className="omni-results" role="listbox" id={listId}>
          {results.map((r, i) => (
            <li
              key={
                r.kind === "place"
                  ? `p-${r.place.id}`
                  : r.kind === "fiction"
                    ? `f-${r.fiction.slug}`
                    : `c-${r.city.id}`
              }
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(r)}
            >
              {r.kind === "place" ? (
                <>
                  <MapPin size={15} aria-hidden />
                  <span>
                    <strong>{r.place.label}</strong>
                    <small>Walk here · {r.place.detail}</small>
                  </span>
                </>
              ) : r.kind === "fiction" ? (
                <>
                  <Sparkles size={15} aria-hidden />
                  <span>
                    <strong>{r.fiction.name}</strong>
                    <small>Fictional city · {r.fiction.tagline}</small>
                  </span>
                </>
              ) : (
                <>
                  <Building2 size={15} aria-hidden />
                  <span>
                    <strong>
                      {r.city.name}
                      {r.city.state ? `, ${r.city.state}` : ""}
                    </strong>
                    <small>
                      {prebuiltAreaFor(r.city.lat, r.city.lon, 1000)
                        ? "Ready instantly · full campus"
                        : "Open on the city map"}
                    </small>
                  </span>
                </>
              )}
            </li>
          ))}
          <li className="omni-google">
            <a
              href={googleMapsSearch(
                results.length ? query : `${query} near ${areaName}`,
              )}
              target="_blank"
              rel="noreferrer"
              onMouseDown={(e) => e.preventDefault()}
            >
              {results.length ? "Not here? " : "Nothing on Walk-Free's map. "}
              Search “{query}” in Google Maps <ArrowUpRight size={12} />
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
