import { describe, it, expect } from "vitest";
import { mergeMissingParamsIntoBody } from "./curlBlueprint";

describe("mergeMissingParamsIntoBody — wire spec-only params into the request body", () => {
  it("injects a missing param at the same nesting level as existing params (kie `input` shape)", () => {
    // kie GPT Image-2: agent only templatized prompt + aspect_ratio (seen in the
    // minimal curl). resolution comes from the spec and must ride in `input` too.
    const body = {
      model: "{{model.modelKey}}",
      input: {
        prompt: "{{request.prompt}}",
        aspect_ratio: "{{request.params.aspect_ratio}}",
      },
    };
    const out = mergeMissingParamsIntoBody(body, ["prompt", "aspect_ratio", "resolution"]) as any;
    expect(out.input.resolution).toBe("{{request.params.resolution}}");
    // existing placeholders untouched
    expect(out.input.aspect_ratio).toBe("{{request.params.aspect_ratio}}");
    expect(out.input.prompt).toBe("{{request.prompt}}");
    // model wiring untouched
    expect(out.model).toBe("{{model.modelKey}}");
  });

  it("does not mutate the input body (pure)", () => {
    const body = { input: { prompt: "{{request.prompt}}" } };
    const snapshot = JSON.stringify(body);
    mergeMissingParamsIntoBody(body, ["prompt", "duration"]);
    expect(JSON.stringify(body)).toBe(snapshot);
  });

  it("falls back to the prompt container when no params placeholder exists yet", () => {
    const body = { input: { prompt: "{{request.prompt}}" } };
    const out = mergeMissingParamsIntoBody(body, ["prompt", "duration"]) as any;
    expect(out.input.duration).toBe("{{request.params.duration}}");
  });

  it("injects at top-level for a flat body with no nesting", () => {
    const body = { prompt: "{{request.prompt}}" };
    const out = mergeMissingParamsIntoBody(body, ["prompt", "seed"]) as any;
    expect(out.seed).toBe("{{request.params.seed}}");
  });

  it("templatizes an existing literal value in place rather than duplicating", () => {
    // Agent left resolution as a literal default instead of a placeholder.
    const body = {
      input: { prompt: "{{request.prompt}}", resolution: "1K" },
    };
    const out = mergeMissingParamsIntoBody(body, ["prompt", "resolution"]) as any;
    expect(out.input.resolution).toBe("{{request.params.resolution}}");
    // no stray top-level injection
    expect(out.resolution).toBeUndefined();
  });

  it("is a no-op when every field already has a placeholder", () => {
    const body = { input: { prompt: "{{request.prompt}}", aspect_ratio: "{{request.params.aspect_ratio}}" } };
    const out = mergeMissingParamsIntoBody(body, ["prompt", "aspect_ratio"]) as any;
    expect(out).toEqual(body);
  });

  it("returns non-object bodies unchanged", () => {
    expect(mergeMissingParamsIntoBody("raw string", ["x"])).toBe("raw string");
    expect(mergeMissingParamsIntoBody(undefined, ["x"])).toBe(undefined);
  });
});
