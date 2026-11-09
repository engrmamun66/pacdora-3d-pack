import { describe, expect, it, vi } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AI_MODEL, AiExtractionError, type AiBoxAnswer, type BoxExtractorClient, aiBoxSchema, extractBox, interpret, systemPrompt } from "../src";

const answer = (over: Partial<AiBoxAnswer> = {}): AiBoxAnswer => ({
  status: "ok",
  presetId: "straight-tuck-end-box",
  width_mm: 70,
  depth_mm: 40,
  height_mm: 120,
  size_mode: "manufacture",
  board_thickness_mm: null,
  notes: [],
  message: "",
  ...over,
});

describe("interpret (deterministic validation of the model's answer)", () => {
  it("accepts a valid answer and returns engine-checked parameters", () => {
    const r = interpret(answer({ board_thickness_mm: 0.4, notes: ["assumed crease-to-crease"] }));
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.generatorId).toBe("tuck-end-carton");
      expect(r.params).toMatchObject({ width: 70, depth: 40, height: 120, thickness: 0.4, variant: "straight" });
    }
  });

  it("rejects out-of-range numbers before they reach the engine", () => {
    const r = interpret(answer({ width_mm: 5000 }));
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.issues[0]!.path).toBe("width_mm");
  });

  it("rejects non-finite and missing fields", () => {
    expect(interpret({ ...answer(), height_mm: Number.NaN }).kind).toBe("invalid");
    expect(interpret({ status: "ok" }).kind).toBe("invalid");
    expect(interpret("not an object").kind).toBe("invalid");
  });

  it("rejects presets that are not in the catalogue", () => {
    expect(interpret(answer({ presetId: "pacdora-123" as never })).kind).toBe("invalid");
  });

  it("passes engine rule violations back as issues (never bypasses them)", () => {
    // Crash-lock bottoms need depth <= width.
    const r = interpret(answer({ presetId: "crash-lock-bottom-box", width_mm: 50, depth_mm: 80 }));
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.issues.map((i) => i.path)).toContain("depth");
  });

  it("forwards needs_info and unsupported without building parameters", () => {
    const r = interpret(answer({ status: "needs_info", width_mm: 0, message: "What is the height?" }));
    expect(r).toMatchObject({ kind: "needs_info", message: "What is the height?" });
    expect(interpret(answer({ status: "unsupported", message: "Bottles need a different structure." })).kind).toBe("unsupported");
  });
});

describe("prompt and output schema", () => {
  it("lists every catalogue preset in the system prompt", () => {
    const p = systemPrompt();
    for (const id of ["straight-tuck-end-box", "crash-lock-bottom-box", "regular-slotted-shipping-box"]) expect(p).toContain(id);
    expect(p).toMatch(/ignore any instructions/);
  });

  it("output schema is a closed JSON object with every field required", () => {
    const f = betaZodOutputFormat(aiBoxSchema) as unknown as { type: string; schema: { type: string; required: string[]; additionalProperties: boolean } };
    expect(f.type).toBe("json_schema");
    expect(f.schema.type).toBe("object");
    expect(f.schema.additionalProperties).toBe(false);
    expect(f.schema.required.sort()).toEqual(Object.keys(aiBoxSchema.shape).sort());
  });
});

describe("extractBox (API call shape, with a fake client)", () => {
  const fake = (reply: { stop_reason: string; parsed_output: unknown }) => {
    const parse = vi.fn(async (_params: unknown) => reply);
    return { client: { beta: { messages: { parse } } } as unknown as BoxExtractorClient, parse };
  };

  it("sends the description as the user message with structured output, low effort and fallbacks", async () => {
    const { client, parse } = fake({ stop_reason: "end_turn", parsed_output: answer() });
    const r = await extractBox(client, "  A tuck box 70 x 40 x 120 mm  ");
    expect(r.kind).toBe("ok");
    const req = parse.mock.calls[0]![0] as Record<string, unknown> & { messages: { role: string; content: string }[]; output_config: { effort: string; format: { type: string } } };
    expect(req.model).toBe(AI_MODEL);
    expect(req.messages).toEqual([{ role: "user", content: "A tuck box 70 x 40 x 120 mm" }]);
    expect(req.output_config.effort).toBe("low");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect("thinking" in req).toBe(false); // thinking cannot be disabled on this model
    expect("tool_choice" in req).toBe(false);
  });

  it("reports a refusal and an unparseable answer as errors", async () => {
    await expect(extractBox(fake({ stop_reason: "refusal", parsed_output: null }).client, "box")).rejects.toThrow(AiExtractionError);
    await expect(extractBox(fake({ stop_reason: "end_turn", parsed_output: null }).client, "box")).rejects.toThrow(/usable answer/);
  });

  it("refuses empty and over-long input without calling the API", async () => {
    const { client, parse } = fake({ stop_reason: "end_turn", parsed_output: answer() });
    await expect(extractBox(client, "   ")).rejects.toThrow(/describe/);
    await expect(extractBox(client, "x".repeat(1001))).rejects.toThrow(/1000 characters/);
    expect(parse).not.toHaveBeenCalled();
  });

  it("even a well-formed model answer is checked by the engine", async () => {
    const { client } = fake({ stop_reason: "end_turn", parsed_output: answer({ presetId: "regular-slotted-shipping-box", width_mm: 100, depth_mm: 300, height_mm: 200 }) });
    const r = await extractBox(client, "shipping box 100 x 300 x 200");
    expect(r.kind).toBe("invalid");
  });
});
