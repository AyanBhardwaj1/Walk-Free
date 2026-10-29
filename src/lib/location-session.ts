import { friendlyError } from "./errors.js";
import type { LocationFix } from "./walk-location.js";
export type LocationAdapter = (
  onFix: (fix: LocationFix) => void,
  onError: (message: string) => void,
) => Promise<() => void>;
/** Cancellation also covers permission prompts and native watchers that resolve late. */
export class LocationSession {
  private generation = 0;
  private cleanup: (() => void) | null = null;
  constructor(private adapter: LocationAdapter) {}
  stop() {
    this.generation++;
    this.cleanup?.();
    this.cleanup = null;
  }
  async start(
    onFix: (fix: LocationFix) => void,
    onError: (message: string) => void,
  ) {
    this.stop();
    const generation = this.generation;
    const fail = (message: string) => {
      if (generation !== this.generation) return;
      this.stop();
      onError(message);
    };
    try {
      const cleanup = await this.adapter((fix) => {
        if (generation === this.generation) onFix(fix);
      }, fail);
      if (generation !== this.generation) cleanup();
      else this.cleanup = cleanup;
    } catch (error) {
      fail(friendlyError(error, "Your location is unavailable right now."));
    }
  }
}
