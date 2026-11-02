import { parseCitySpec, type CitySpec, type Realism } from "../../shared/city-spec.js";

/** A city someone generated, kept so they can walk back into it. */
export interface GeneratedCity {
  id: string;
  spec: CitySpec;
  realism: Realism;
  /** Who planned it: the AI, or the offline designer. */
  via: "ai" | "offline";
  prompt: string;
  createdAt: string;
}
const KEY = "walk-free-generated-cities";
const KEEP = 6;

function readAll(): GeneratedCity[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((c) => {
      try {
        const v = c as Record<string, unknown>;
        if (typeof v.id !== "string" || !/^ai-[\w-]{1,120}$/.test(v.id))
          return [];
        const realism = ["sketch", "detailed", "dense"].includes(
          v.realism as string,
        )
          ? (v.realism as Realism)
          : "detailed";
        return [
          {
            id: v.id,
            spec: parseCitySpec(v.spec),
            realism,
            via: v.via === "ai" ? "ai" : "offline",
            prompt: typeof v.prompt === "string" ? v.prompt.slice(0, 600) : "",
            createdAt:
              typeof v.createdAt === "string" ? v.createdAt : new Date(0).toISOString(),
          } satisfies GeneratedCity,
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Keeps the latest few, newest first; storage failures are harmless. */
export function rememberGenerated(city: GeneratedCity) {
  try {
    const rest = readAll().filter((c) => c.id !== city.id);
    localStorage.setItem(KEY, JSON.stringify([city, ...rest].slice(0, KEEP)));
  } catch {
    /* Private mode or full storage: the city just won't be listed later. */
  }
}

export function generatedCities() {
  return readAll();
}

export function findGenerated(id: string) {
  return readAll().find((c) => c.id === id) ?? null;
}
