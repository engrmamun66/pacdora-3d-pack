import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at startup. Missing or malformed values
 * fail fast with a clear message instead of failing later at runtime.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(3),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  // Google sign-in is optional: the button only appears when both are set.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /**
   * Request header that carries the real client IP (used for rate limiting). Only
   * list a header your reverse proxy SETS, replacing any value from the client:
   * "x-forwarded-for" (Caddy default, nginx with proxy_set_header) or "cf-connecting-ip".
   */
  CLIENT_IP_HEADER: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/).default("x-forwarded-for"),
  /** Anthropic API key for "describe your box" (optional: the feature is hidden without it). */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** AI requests allowed per user per 24 hours. */
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).max(10_000).default(20),
  /** Directory for uploaded files (default: ./storage relative to the app). */
  STORAGE_DIR: z.string().min(1).optional(),
});

/** Public Cloudflare test secrets always pass; they must never run a public site. */
const isTurnstileTestKey = (k: string) => /^[123]x0{20,}/.test(k);

const parsed = schema
  .superRefine((e, ctx) => {
    // Production-only checks. Skipped while building and for localhost (local production test runs).
    const building = process.env.NEXT_PHASE === "phase-production-build";
    const local = ["localhost", "127.0.0.1"].includes(new URL(e.BETTER_AUTH_URL).hostname);
    if (process.env.NODE_ENV !== "production" || building || local) return;
    if (!e.BETTER_AUTH_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: "must be https:// in production (session cookies are only marked Secure then)" });
    }
    if (isTurnstileTestKey(e.TURNSTILE_SECRET_KEY)) {
      ctx.addIssue({ code: "custom", path: ["TURNSTILE_SECRET_KEY"], message: "is a Cloudflare TEST key (always passes); use a real key in production" });
    }
  })
  .safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid server environment (see apps/web/.env.example):\n${lines}`);
}

export const env = parsed.data;
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY);
