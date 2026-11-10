import { afterEach, describe, expect, it, vi } from "vitest";

describe("web speech", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stops a long reply's later sentences when speech is stopped", async () => {
    const spoken: string[] = [];
    let playing: { onend?: () => void } | null = null;
    class Utterance {
      lang = "";
      rate = 1;
      voice: unknown = null;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    }
    const synth = {
      getVoices: () => [],
      speak: (u: Utterance) => {
        spoken.push(u.text);
        playing = u;
      },
      // Cancelling ends the sentence playing now, as browsers do.
      cancel: () => {
        const p = playing;
        playing = null;
        p?.onend?.();
      },
    };
    vi.stubGlobal("window", { speechSynthesis: synth });
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    const { speak, stopSpeech } = await import("../src/lib/navigation");
    const long = Array.from(
      { length: 6 },
      (_, i) => `Sentence number ${i} is long enough to need its own turn.`,
    ).join(" ");
    const done = speak(long);
    await Promise.resolve();
    expect(spoken).toHaveLength(1);
    stopSpeech();
    await done;
    expect(spoken).toHaveLength(1);
  });
});
