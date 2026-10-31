import { describe, expect, it } from "vitest";
import { chatRequestSchema, SYSTEM_PROMPT } from "../server/agent";

const context = {
  area: "UT Austin",
  localTime: "Sat, Oct 31, 4:00 AM",
  weather: "70°F",
  canBuildAreas: true,
};
const messages = [{ role: "user", content: "¿Cuál es la ruta más fresca?" }];

describe("assistant language and outlook context", () => {
  it("asks the model to reply in the person's language", () => {
    expect(SYSTEM_PROMPT).toMatch(/same language the person writes in/);
  });

  it("asks the model to mention official alerts and unhealthy air", () => {
    expect(SYSTEM_PROMPT).toMatch(/official heat or air-quality alert/i);
  });

  it("accepts air quality and alerts in the situation, with limits", () => {
    expect(
      chatRequestSchema.parse({
        messages,
        context: {
          ...context,
          airQuality: "US AQI 41 (Good)",
          alerts: "Extreme Heat Warning until Sun 8 PM",
        },
      }).context.airQuality,
    ).toBe("US AQI 41 (Good)");
    expect(() =>
      chatRequestSchema.parse({
        messages,
        context: { ...context, alerts: "x".repeat(401) },
      }),
    ).toThrow();
    expect(() =>
      chatRequestSchema.parse({
        messages,
        context: { ...context, airQuality: "x".repeat(121) },
      }),
    ).toThrow();
  });

  it("still accepts the old situation shape", () => {
    expect(chatRequestSchema.parse({ messages, context }).context).toEqual(
      context,
    );
  });
});
