/** The last campus, city or fictional city opened, for "pick up where you left off". */
export interface LastPlace {
  name: string;
  /** Always an /app link with query parameters. */
  href: string;
}
const KEY = "walk-free-last-place";

export function rememberPlace(place: LastPlace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    /* Private mode or full storage: the home page just won't offer it. */
  }
}

/** The remembered place, only if it is still a safe in-app link. */
export function lastPlace(): LastPlace | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;
    if (!v || typeof v !== "object") return null;
    const { name, href } = v as Record<string, unknown>;
    return typeof name === "string" &&
      name.length > 0 &&
      name.length <= 80 &&
      typeof href === "string" &&
      href.length <= 200 &&
      /^\/app\?[\w=&.%-]+$/.test(href)
      ? { name, href }
      : null;
  } catch {
    return null;
  }
}
