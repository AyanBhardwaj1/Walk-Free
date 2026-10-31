import type { RoutePreference } from "../../shared/types.js";

/** A walk someone starred, kept in this browser. */
export interface SavedWalk {
  id: string;
  /** The world the walk's points belong to; names can repeat. */
  worldId: string;
  areaName: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  pref: RoutePreference;
  savedAt: string;
}

const KEY = "walk-free-saved-walks";
const MAX_SAVED = 12;
const PREFERENCES: RoutePreference[] = [
  "quickest",
  "shade",
  "scenic",
  "indoors",
  "stepfree",
  "night",
];
const TEXT_FIELDS = [
  "id",
  "worldId",
  "areaName",
  "from",
  "to",
  "fromLabel",
  "toLabel",
] as const;

/** A stored entry with every field present and well typed. */
function valid(w: unknown): w is SavedWalk {
  if (!w || typeof w !== "object") return false;
  const entry = w as Record<string, unknown>;
  return (
    TEXT_FIELDS.every((k) => typeof entry[k] === "string") &&
    PREFERENCES.includes(entry.pref as RoutePreference)
  );
}

export function loadSavedWalks(): SavedWalk[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    // Another version (or a person) may have written anything here.
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

function store(walks: SavedWalk[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(walks));
  } catch {
    /* Storage can be full or unavailable; the list stays as it was. */
  }
  return walks;
}

/** Saves a walk at the top of the list, replacing the same walk if present. */
export function saveWalk(walk: Omit<SavedWalk, "id" | "savedAt">) {
  const same = (w: SavedWalk) =>
    w.worldId === walk.worldId &&
    w.from === walk.from &&
    w.to === walk.to &&
    w.pref === walk.pref;
  return store(
    [
      {
        ...walk,
        id: `${walk.from}>${walk.to}>${walk.pref}>${Date.now()}`,
        savedAt: new Date().toISOString(),
      },
      ...loadSavedWalks().filter((w) => !same(w)),
    ].slice(0, MAX_SAVED),
  );
}

export function removeSavedWalk(id: string) {
  return store(loadSavedWalks().filter((w) => w.id !== id));
}
