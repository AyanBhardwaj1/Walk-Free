import { useState } from "react";
import { searchDestinations, type Destination } from "../lib/destinations";
export default function EndpointPicker({
  label,
  catalog,
  value,
  disabled,
  onChange,
}: {
  label: "From" | "To";
  catalog: Destination[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const { shown, total } = searchDestinations(catalog, query, value);
  return (
    <div className="endpoint-picker">
      <label>
        {label.toUpperCase()}
        <input
          className="text-field"
          aria-label={
            label === "From" ? "Search starting point" : "Search destination"
          }
          placeholder="Search a building, street, or path…"
          value={query}
          disabled={disabled || !catalog.length}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={label}
          value={value}
          disabled={disabled || !catalog.length}
          onChange={(e) => {
            onChange(e.target.value);
            setQuery("");
          }}
        >
          {!value && <option value="">Choose a mapped path</option>}
          {shown.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} · {n.detail}
            </option>
          ))}
        </select>
      </label>
      {query && (
        <p className="fine" role="status">
          {total
            ? `${total} matching points${total > 60 ? "; refine your search to see more" : ""}.`
            : "No matching paths. Try a street or choose on the map."}
        </p>
      )}
    </div>
  );
}
