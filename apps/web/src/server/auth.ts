import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins";
import { db } from "./db";
import { env, googleEnabled } from "./env";
import { sendActionEmail } from "./mailer";

/**
 * Authentication: email/password (verified email required), optional Google,
 * Cloudflare Turnstile on credential endpoints, DB-backed rate limiting.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendActionEmail({
        to: user.email,
        subject: "Reset your password",
        intro: "Someone (hopefully you) asked to reset the password for this account. The link expires in 1 hour.",
        actionLabel: "Choose a new password",
        url,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendActionEmail({
        to: user.email,
        subject: "Confirm your email",
        intro: "Please confirm your email address to finish creating your account. The link expires in 1 hour.",
        actionLabel: "Confirm email",
        url,
      });
    },
  },

  socialProviders: googleEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } }
    : {},

  account: {
    accountLinking: {
      enabled: true,
      // Google verifies email ownership. Better Auth still refuses to link when
      // the existing local account's email is unverified (requireLocalEmailVerified).
      trustedProviders: ["google"],
    },
  },

  advanced: {
    // Rate limits are keyed by client IP: read it only from the header our proxy sets (see docs/deploy.md).
    ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] },
  },

  rateLimit: {
    enabled: true, // Better Auth enables it only in production by default; we want it everywhere.
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
    },
  },

  plugins: [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET_KEY,
      endpoints: ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/send-verification-email"],
    }),
    nextCookies(), // must stay last: lets server actions set auth cookies
  ],
});
