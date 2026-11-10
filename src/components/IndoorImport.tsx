import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Clock,
  Eye,
  EyeOff,
  FlipHorizontal2,
  RotateCw,
  Trash2,
  Upload,
} from "lucide-react";
import type { SceneObject, World } from "../../shared/types";
import {
  toGray,
  vectorizePlan,
  type VectorPlan,
} from "../lib/indoor/plan-image";
import { readFeatures, featuresToLevels } from "../lib/indoor/import-geojson";
import {
  addInterior,
  footprintRing,
  placePlan,
  removeInterior,
  setInteriorHours,
} from "../lib/indoor/place";
import { hoursStatus, parseOpeningHours } from "../lib/opening-hours";
import type { IndoorLevel } from "../lib/indoor/types";

/** Plans are traced at most this many pixels on their longer side. */
const TRACE_PX = 1100;
/** Largest file read, bytes (IMDF archives of big campuses run to tens of MB). */
const MAX_BYTES = 60e6;

interface Draft {
  plan: VectorPlan;
  /** The uploaded image, for the preview under the traced rooms. */
  url: string;
  turns: number;
  mirror: boolean;
  ordinal: number;
  /** Rooms marked as stairs or a lift, by index. */
  kinds: ("stairs" | "elevator" | undefined)[];
}

/** Downscaled grey pixels of an image file. */
async function imagePixels(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, TRACE_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)),
    h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw Error("This browser can't read images.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return toGray(ctx.getImageData(0, 0, w, h));
}

/** The middle of a set of map points. */
function centre(points: [number, number][]) {
  const n = Math.max(1, points.length);
  return [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
  ] as const;
}

/**
 * The inside of a selected building: bring in a floor plan (a photo or
 * drawing, an IMDF archive, OpenStreetMap indoor or other GeoJSON), see it
 * in 3D, and walk through it, since its corridors join the route network.
 */
export default function IndoorImport({
  world,
  building,
  open,
  level,
  onOpen,
  onLevel,
  onChange,
  at,
}: {
  world: World;
  building: SceneObject;
  /** The time the map shows (ISO), for whether the building is open. */
  at: string;
  /** Whether the interior is showing (the shell hidden). */
  open: boolean;
  level: number;
  onOpen: (open: boolean) => void;
  onLevel: (ordinal: number) => void;
  /** Applies a world with the interior added or removed. */
  onChange: (world: World, message: string) => void;
}) {
  const interior = world.indoor?.find((i) => i.buildingId === building.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hoursDraft, setHoursDraft] = useState(interior?.hours ?? "");
  const [hoursError, setHoursError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const name = building.name || "this building";

  // A new building starts afresh.
  useEffect(() => {
    setDraft(null);
    setError("");
    setHoursError("");
  }, [building.id]);
  // The hours field follows the stored hours (a new building, an import).
  const storedHours = interior?.hours ?? "";
  useEffect(() => setHoursDraft(storedHours), [storedHours, building.id]);
  const status = hoursStatus(interior?.hours, new Date(at), world.timezone);
  const saveHours = () => {
    const text = hoursDraft.trim();
    if (text && !parseOpeningHours(text)) {
      setHoursError(
        "Walk-Free couldn't read those hours. Try a form like Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off.",
      );
      return;
    }
    setHoursError("");
    if (text === storedHours) return;
    onChange(
      setInteriorHours(world, building.id, text || null),
      text
        ? `Saved hours for ${name}: routes walk around it while it's closed.`
        : `Cleared the hours for ${name}: routes treat it as open.`,
    );
  };
  const url = draft?.url;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const nextOrdinal = interior
    ? Math.max(...interior.levels.map((l) => l.ordinal)) + 1
    : 0;

  /** The building with its existing levels and these new ones. */
  const apply = (levels: IndoorLevel[], source: string, hours?: string) => {
    const kept = (interior?.levels ?? []).filter(
      (l) => !levels.some((n) => n.ordinal === l.ordinal),
    );
    const all = [...kept, ...levels].sort((a, b) => a.ordinal - b.ordinal);
    const next = addInterior(world, {
      buildingId: building.id,
      buildingName: name,
      source:
        interior && interior.source !== source
          ? `${interior.source} + ${source}`.slice(0, 60)
          : source,
      levels: all,
      // Hours from the file, else any the building already had.
      ...((hours ?? interior?.hours)
        ? { hours: hours ?? interior?.hours }
        : {}),
    });
    const rooms = levels.reduce((s, l) => s + l.rooms.length, 0);
    // Connected when at least one doorway joins it to a path outside.
    const tag = `indoor:${building.id}:`;
    const doorways = next.graph.edges.filter(
      (e) => e.id.startsWith(tag) && e.indoor === "no",
    ).length;
    // A floor off the ground joins only through stairs or a lift that
    // line up with the floor next to it.
    const ground = [...all].sort(
      (a, b) => Math.abs(a.ordinal) - Math.abs(b.ordinal),
    )[0]?.ordinal;
    const cutOff = levels.filter(
      (l) =>
        l.ordinal !== ground &&
        !next.graph.nodes.some((n) => n.id.startsWith(`${tag}f${l.ordinal}`)),
    );
    onChange(
      next,
      `${rooms} room${rooms === 1 ? "" : "s"} placed in ${name}` +
        (doorways > 0
          ? `; its corridors join your walks through ${doorways} entrance${doorways === 1 ? "" : "s"}.`
          : ". No corridor reached a path outside, so routes go around it.") +
        (doorways > 0 && cutOff.length
          ? ` ${cutOff.map((l) => l.name).join(" and ")} isn't joined to the floor${cutOff.length === 1 ? "" : "s"} beside it yet: mark the stairs or lift on both (tap the room before placing).`
          : ""),
    );
    onLevel(levels[0]?.ordinal ?? 0);
    onOpen(true);
  };

  const read = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      const list = [...files];
      if (list.some((f) => f.size > MAX_BYTES))
        throw Error("That file is too large (60 MB at most).");
      const image = list.find((f) => f.type.startsWith("image/"));
      if (image) {
        // Let "Reading the plan…" paint before the tracing holds the thread.
        await new Promise((r) => setTimeout(r, 30));
        const plan = vectorizePlan(await imagePixels(image));
        if (!plan.rooms.length && !plan.corridors.length)
          throw Error(
            "No rooms found in that image. A plan with dark walls on a light background works best.",
          );
        setDraft({
          plan,
          url: URL.createObjectURL(image),
          turns: 0,
          mirror: false,
          ordinal: nextOrdinal,
          kinds: [],
        });
        return;
      }
      const data = await Promise.all(
        list.map(async (f) => ({
          name: f.name,
          data: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const { levels, source, hours } = featuresToLevels(
        readFeatures(data),
        world.origin,
      );
      if (!levels.length)
        throw Error(
          "No rooms or corridors in that file. Walk-Free reads IMDF, OpenStreetMap indoor tagging, and GeoJSON polygons and lines.",
        );
      // A map of somewhere else entirely is almost certainly a mistake.
      const [bx, bz] = centre(footprintRing(building));
      const [mx, mz] = centre(
        levels.flatMap((l) => [
          ...l.rooms.flatMap((r) => r.ring),
          ...l.paths.flat(),
        ]),
      );
      const off = Math.hypot(mx - bx, mz - bz);
      if (off > 300)
        throw Error(
          `That map is ${Math.round(off / 100) / 10} km from ${name}. Choose the building it belongs to.`,
        );
      apply(levels, source, hours);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const plan = draft?.plan;
  // Preview: the traced rooms over the uploaded image, turned and mirrored
  // as they will be placed (the image itself shows as uploaded).
  const preview = plan && (
    <figure className="plan-preview">
      <div className="plan-stage">
        <img src={draft.url} alt="" />
        <svg
          viewBox={`0 0 ${plan.width} ${plan.height}`}
          role="group"
          aria-label="Rooms traced from the plan"
        >
          {plan.rooms.map((r, i) => {
            const kind = draft.kinds[i];
            // Tap (or Enter) cycles room → stairs → lift → room.
            const cycle = () => {
              const kinds = [...draft.kinds];
              kinds[i] =
                kind === undefined
                  ? "stairs"
                  : kind === "stairs"
                    ? "elevator"
                    : undefined;
              setDraft({ ...draft, kinds });
            };
            return (
              <polygon
                key={i}
                points={r.ring.map((p) => p.join(",")).join(" ")}
                className={`plan-room${kind ? ` is-${kind}` : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${r.label}, ${kind === "stairs" ? "stairs" : kind === "elevator" ? "lift" : "a room"}: change`}
                onClick={cycle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    cycle();
                  }
                }}
              />
            );
          })}
          {[...plan.corridors, ...plan.links].map((l, i) => (
            <polyline
              key={i}
              points={l.map((p) => p.join(",")).join(" ")}
              className="plan-path"
            />
          ))}
          {plan.doors.map((d, i) => (
            <circle key={i} cx={d[0]} cy={d[1]} r={4} className="plan-door" />
          ))}
        </svg>
      </div>
      <figcaption>
        Found {plan.rooms.length} room{plan.rooms.length === 1 ? "" : "s"},{" "}
        {plan.corridors.length ? "a corridor network" : "no corridor"} and{" "}
        {plan.doors.length} doorway{plan.doors.length === 1 ? "" : "s"}. Tap a
        room to mark it as stairs or a lift: floors join where they line up.
      </figcaption>
    </figure>
  );

  return (
    <div className="indoor-card">
      <div className="section-title">
        <Building2 size={17} /> Inside {name}
      </div>
      {interior ? (
        <>
          <p className="fine">
            {interior.levels.reduce((s, l) => s + l.rooms.length, 0)} rooms on{" "}
            {interior.levels.length} level
            {interior.levels.length === 1 ? "" : "s"} · {interior.source}
          </p>
          <div className="indoor-hours">
            <div className="indoor-hours-head">
              <label htmlFor={`hours-${building.id}`}>
                <Clock size={14} aria-hidden /> Opening hours
              </label>
              {status && (
                <span className={status.open ? "is-open" : "is-closed"}>
                  {status.label}
                </span>
              )}
            </div>
            <div className="indoor-hours-row">
              <input
                id={`hours-${building.id}`}
                type="text"
                value={hoursDraft}
                placeholder="Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off"
                maxLength={500}
                spellCheck={false}
                autoComplete="off"
                aria-describedby={`hours-note-${building.id}`}
                aria-invalid={!!hoursError}
                onChange={(e) => setHoursDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveHours();
                }}
              />
              <button
                className="secondary"
                disabled={hoursDraft.trim() === storedHours}
                onClick={saveHours}
              >
                Save
              </button>
            </div>
            {hoursError ? (
              <p className="chat-error" role="alert">
                {hoursError}
              </p>
            ) : (
              <p className="fine" id={`hours-note-${building.id}`}>
                {status
                  ? status.open
                    ? "Routes can walk through it now."
                    : "Routes walk around it until it opens, unless the walk starts or ends inside."
                  : "Unknown hours: routes treat it as open. OpenStreetMap's opening_hours format, as on the door."}
              </p>
            )}
          </div>
          <div className="chip-row" role="group" aria-label="Level">
            {interior.levels.map((l) => (
              <button
                key={l.ordinal}
                className="chip"
                aria-pressed={open && level === l.ordinal}
                onClick={() => {
                  onLevel(l.ordinal);
                  onOpen(true);
                }}
              >
                {l.name}
              </button>
            ))}
          </div>
          <div className="indoor-actions">
            <button className="secondary" onClick={() => onOpen(!open)}>
              {open ? <EyeOff size={15} /> : <Eye size={15} />}
              {open ? "Show the outside" : "See inside"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                onOpen(false);
                onChange(
                  removeInterior(world, building.id),
                  `Removed the inside of ${name}.`,
                );
              }}
            >
              <Trash2 size={15} /> Remove
            </button>
          </div>
        </>
      ) : (
        <p className="fine">
          Add a floor plan to walk through {name}: a photo or drawing of the
          plan, an IMDF archive, or OpenStreetMap indoor GeoJSON. Its corridors
          join your routes as covered, indoor paths.
        </p>
      )}
      {draft ? (
        <>
          {preview}
          <div className="indoor-actions">
            <button
              className="secondary"
              onClick={() =>
                setDraft({ ...draft, turns: (draft.turns + 1) % 4 })
              }
            >
              <RotateCw size={15} /> Turn ({draft.turns * 90}°)
            </button>
            <button
              className="secondary"
              aria-pressed={draft.mirror}
              onClick={() => setDraft({ ...draft, mirror: !draft.mirror })}
            >
              <FlipHorizontal2 size={15} /> Mirror
            </button>
          </div>
          <label className="indoor-level">
            Floor
            <input
              type="number"
              min={-5}
              max={150}
              value={draft.ordinal}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isFinite(v))
                  setDraft({
                    ...draft,
                    ordinal: Math.max(-5, Math.min(150, Math.round(v))),
                  });
              }}
            />
            <small>0 is the ground floor</small>
          </label>
          <div className="indoor-actions">
            <button
              className="primary"
              onClick={() => {
                apply(
                  [
                    placePlan(draft.plan, building, {
                      turns: draft.turns,
                      mirror: draft.mirror,
                      ordinal: draft.ordinal,
                      kinds: draft.kinds,
                    }),
                  ],
                  "floor plan image",
                );
                setDraft(null);
              }}
            >
              Place it in {name}
            </button>
            <button className="secondary" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
          <p className="fine">
            The plan is stretched to the building&apos;s outline along its
            longer side. Turn or mirror it if the rooms land the wrong way
            round.
          </p>
        </>
      ) : (
        <>
          <button
            className={`secondary upload-button${busy ? " busy" : ""}`}
            disabled={busy}
            aria-busy={busy}
            onClick={() => input.current?.click()}
          >
            {busy
              ? "Reading the plan…"
              : interior
                ? "Add another floor"
                : "Add a floor plan"}
            <Upload size={15} />
          </button>
          <input
            ref={input}
            type="file"
            hidden
            accept="image/*,.geojson,.json,.zip,application/geo+json,application/zip"
            multiple
            aria-label={`Floor plan for ${name}`}
            onChange={(e) => void read(e.target.files)}
          />
        </>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
