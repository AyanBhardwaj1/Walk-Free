import { useCallback, useEffect, useMemo, useState } from "react";
import { startTracking } from "../lib/navigation";
import { LocationSession } from "../lib/location-session";
import { usableFix, type LocationFix } from "../lib/walk-location";
export function useWalkLocation() {
  const session = useMemo(() => new LocationSession(startTracking), []);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [mode, setMode] = useState<"idle" | "locating" | "walking">("idle");
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
    (walk: boolean) => {
      setMode(walk ? "walking" : "locating");
      setFix(null);
      setStatus("Finding your location…");
      void session.start(
        (next) => {
          if (!usableFix(next)) {
            setStatus("Waiting for a recent, more accurate GPS position…");
            return;
          }
          setFix(next);
          setStatus(`GPS accuracy ±${Math.round(next.accuracy)} m`);
          if (!walk) {
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
