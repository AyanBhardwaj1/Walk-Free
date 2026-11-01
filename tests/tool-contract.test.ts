import { describe, expect, it } from "vitest";
import { ASSISTANT_TOOLS } from "../shared/assistant";
import { TOOL_NAMES, toolSchema } from "../src/lib/assistant-tools";

/**
 * The model is told about tools in shared/assistant.ts; the browser runs
 * them with schemas in src/lib/assistant-tools.ts. They must agree, or the
 * model calls tools that fail, or tools exist that it never hears about.
 */
describe("assistant tool contract", () => {
  const specs = ASSISTANT_TOOLS.map((t) => t.function);

  it("offers the model exactly the tools the browser can run", () => {
    expect(specs.map((s) => s.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  for (const spec of specs) {
    const params = spec.parameters as unknown as {
      properties?: Record<string, { type?: string; enum?: string[] }>;
      required?: string[];
    };
    const schema = toolSchema(spec.name)!;
    const shape = (schema as unknown as { shape: Record<string, unknown> })
      .shape;

    it(`${spec.name}: same parameters on both sides`, () => {
      expect(Object.keys(params.properties ?? {}).sort()).toEqual(
        Object.keys(shape).sort(),
      );
    });

    it(`${spec.name}: required parameters are required by the schema`, () => {
      for (const name of params.required ?? []) {
        expect(schema.safeParse({}).success).toBe(false);
        const optional = (
          shape[name] as { isOptional(): boolean }
        ).isOptional();
        expect(optional, name).toBe(false);
      }
      for (const name of Object.keys(shape))
        if (!(params.required ?? []).includes(name))
          expect(
            (shape[name] as { isOptional(): boolean }).isOptional(),
            name,
          ).toBe(true);
    });

    it(`${spec.name}: has a description the model can act on`, () => {
      expect(spec.description.length).toBeGreaterThan(30);
    });
  }
});
