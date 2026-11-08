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
  /** Directory for uploaded files (default: ./storage relative to the app). */
  STORAGE_DIR: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid server environment (see apps/web/.env.example):\n${lines}`);
}

export const env = parsed.data;
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
