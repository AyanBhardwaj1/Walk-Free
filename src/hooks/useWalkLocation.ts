import { useCallback, useEffect, useMemo, useState } from "react";
import { startTracking } from "../lib/navigation";
import { LocationSession } from "../lib/location-session";
import { usableFix, type LocationFix } from "../lib/walk-location";
import { followableFix } from "../lib/follow";

/**
 * Where you are. "locating" takes one fix; "walking" follows a navigated
 * walk and needs GPS-grade fixes; "following" follows you across the map
 * on a phone or a laptop (Wi-Fi fixes of up to 150 m, smoothed by the app).
 */
export type LocationMode = "idle" | "locating" | "walking" | "following";
export function useWalkLocation() {
  const session = useMemo(() => new LocationSession(startTracking), []);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [mode, setMode] = useState<LocationMode>("idle");
  const [status, setStatus] = useState("");
  const stop = useCallback(() => {
    session.stop();
    setMode("idle");
  }, [session]);
  const reset = useCallback(() => {
    stop();
    setFix(null);
    setStatus("");
  }, [stop]);
  useEffect(() => () => session.stop(), [session]);
  const begin = useCallback(
    (how: boolean | "walk" | "locate" | "follow") => {
      // Older callers pass true for a walk and false for a single fix.
      const kind = how === true ? "walk" : how === false ? "locate" : how;
      setMode(
        kind === "walk"
          ? "walking"
          : kind === "follow"
            ? "following"
            : "locating",
      );
      setFix(null);
      setStatus("Finding your location…");
      void session.start(
        (f) => {
          const ok = kind === "follow" ? followableFix(f) : usableFix(f);
          if (!ok) {
            setStatus(
              kind === "follow"
                ? "Waiting for your location…"
                : "Waiting for a recent, more accurate GPS position…",
            );
            return;
          }
          setFix(f);
          setStatus(
            f.accuracy > 50
              ? `Approximate location (±${Math.round(f.accuracy)} m, from Wi-Fi)`
              : `GPS accuracy ±${Math.round(f.accuracy)} m`,
          );
          if (kind === "locate") {
            session.stop();
            setMode("idle");
          }
        },
        (message) => {
          setMode("idle");
          setStatus(message);
        },
      );
    },
    [session],
  );
  return { fix, mode, status, begin, stop, reset };
}
