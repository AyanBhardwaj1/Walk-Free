import type { RoutePreference } from "../../shared/types.js";

/** A walk someone starred, kept in this browser. */
export interface SavedWalk {
  id: string;
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

export function loadSavedWalks(): SavedWalk[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (w): w is SavedWalk =>
            !!w && typeof w.id === "string" && typeof w.from === "string",
        )
      : [];
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
    w.areaName === walk.areaName &&
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
