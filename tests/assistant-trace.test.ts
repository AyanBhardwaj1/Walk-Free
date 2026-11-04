import { describe, expect, it } from "vitest";
import { modelLabel, traceText } from "../src/components/AssistantPanel";

describe("assistant trace", () => {
  it("names Meta's models in words", () => {
    expect(modelLabel("muse-spark-1.3")).toBe("Meta's Muse Spark");
    expect(modelLabel("gpt-5-mini")).toBe("gpt-5-mini");
  });
  it("pretty-prints JSON and cuts long text", () => {
    expect(traceText('{"a":1}')).toBe('{\n "a": 1\n}');
    expect(traceText("not json")).toBe("not json");
    expect(traceText("x".repeat(20), 5)).toBe("xxxxx…");
  });
});
