import { describe, expect, it } from "vitest";
import { speechChunks, translateGuidance } from "../src/lib/speech-i18n";

describe("spoken guidance in other languages", () => {
  it("translates the instruction and keeps the street's name", () => {
    expect(translateGuidance("Turn left onto Speedway.", "es-ES")).toBe(
      "Gire a la izquierda hacia Speedway.",
    );
    expect(
      translateGuidance(
        "Head along the footpath. Shade in 50 metres.",
        "fr-FR",
      ),
    ).toBe("Suivez le sentier. De l'ombre dans 50 mètres.");
    expect(
      translateGuidance(
        "Continue along Guadalupe Street. Shade just ahead.",
        "pt-BR",
      ),
    ).toBe("Continue por Guadalupe Street. Sombra logo à frente.");
    expect(translateGuidance("You have arrived.", "zh-CN")).toBe("您已到达。");
    // English, and an unknown language, are left as they are.
    expect(translateGuidance("Turn right onto 24th Street.", "en-US")).toBe(
      "Turn right onto 24th Street.",
    );
    expect(translateGuidance("Turn right onto 24th Street.", "xx-XX")).toBe(
      "Turn right onto 24th Street.",
    );
  });

  it("speaks long text sentence by sentence", () => {
    const long = "One. ".repeat(60).trim();
    const chunks = speechChunks(long, 50);
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((c) => c.length <= 55)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
    expect(speechChunks("Short.")).toEqual(["Short."]);
  });
});
