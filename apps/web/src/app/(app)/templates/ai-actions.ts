"use server";

import Anthropic from "@anthropic-ai/sdk";
import { headers } from "next/headers";
import { AiExtractionError, type InterpretResult, MAX_DESCRIPTION_CHARS, extractBox } from "@packaging/ai-contract";
import { getPreset } from "@packaging/dieline-engine";
import { verifyCaptcha } from "@/server/captcha";
import { db } from "@/server/db";
import { aiEnabled, env } from "@/server/env";
import { takeToken } from "@/server/limits";
import { requireUser } from "@/server/session";
import { tryThumbnail } from "@/lib/dieline-preview";

export type SuggestResponse =
  | { ok: false; message: string; retryCaptcha?: boolean }
  | { ok: true; result: InterpretResult; presetName: string | null; thumbnail: string | null; remaining: number };

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

/**
 * "Describe your box": natural language -> validated template parameters.
 * Guards: signed in, feature configured, input length, per-user daily quota,
 * captcha. The answer is re-validated by the geometry engine (ai-contract).
 */
export async function suggestBox(description: string, captchaToken: string): Promise<SuggestResponse> {
  const user = await requireUser();
  if (!aiEnabled) return { ok: false, message: "AI suggestions are not configured on this server (ANTHROPIC_API_KEY is missing)." };
  if (typeof description !== "string" || !description.trim()) return { ok: false, message: "Please describe the box." };
  if (description.length > MAX_DESCRIPTION_CHARS) return { ok: false, message: `Please keep the description under ${MAX_DESCRIPTION_CHARS} characters.` };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await verifyCaptcha(typeof captchaToken === "string" ? captchaToken : null, ip))) {
    return { ok: false, message: "Please complete the human check and try again.", retryCaptcha: true };
  }

  // Counted atomically (per-user lock) BEFORE the paid call, so parallel requests cannot exceed the limit.
  if (!(await takeToken(user.id, "ai", env.AI_DAILY_LIMIT, 24 * 60 * 60))) {
    return { ok: false, message: `Daily limit of ${env.AI_DAILY_LIMIT} AI suggestions reached. Try again tomorrow or set the dimensions by hand.` };
  }
  const used = await db.rateEvent.count({ where: { userId: user.id, kind: "ai", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });

  const record = (outcome: string) => db.aiRequest.create({ data: { userId: user.id, outcome, inputChars: description.length } });
  try {
    const result = await extractBox(anthropic(), description);
    await record(result.kind);
    const preset = result.presetId ? getPreset(result.presetId) : undefined;
    return {
      ok: true,
      result,
      presetName: preset?.name ?? null,
      thumbnail: result.kind === "ok" ? tryThumbnail(result.generatorId, result.params) : null,
      remaining: Math.max(0, env.AI_DAILY_LIMIT - used),
    };
  } catch (e) {
    await record("error");
    if (e instanceof AiExtractionError) return { ok: false, message: e.message };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, message: "The AI service is busy. Please try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, message: "The AI service rejected this server's API key." };
    if (e instanceof Anthropic.APIError) return { ok: false, message: `The AI service returned an error (${e.status ?? "network"}). Please try again.` };
    throw e;
  }
}
