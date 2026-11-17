import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { db } from "./db";
import { devOtp, env } from "./env";
import { sendSms, smsConfigured } from "./sms";
import { formatPhone } from "@/lib/phone";
import { site } from "@/config/site";

/**
 * Sign-in of customers of a Client's portal: a mobile number and a one-time code sent by SMS (MiMSMS).
 * Not a Client account: a customer has its own table and its own cookie, and cannot open Client pages.
 *
 * Development shortcut: when MIMSMS_DEV_PASS is set, that value is the code for every number and no SMS is sent.
 * Empty or missing: a random 6-digit code is sent by SMS.
 */
export const OTP_TTL_MS = 5 * 60_000;
export const RESEND_AFTER_SEC = 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = 30;
const COOKIE = "customer_session";

const codeHash = (phone: string, code: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`otp:${phone}:${code}`).digest("hex");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Count a hit on `key` inside a window; false when the limit is used up. (Rows of the RateLimit table, which is generic.) */
async function hit(key: string, max: number, windowMs: number): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hit:${key}`}, 0))`;
    const now = Date.now();
    const row = await tx.rateLimit.findUnique({ where: { key } });
    if (!row || now - Number(row.lastRequest) > windowMs) {
      await tx.rateLimit.upsert({ where: { key }, create: { id: `h-${key}`.slice(0, 100), key, count: 1, lastRequest: BigInt(now) }, update: { count: 1, lastRequest: BigInt(now) } });
      return true;
    }
    if (row.count >= max) return false;
    await tx.rateLimit.update({ where: { key }, data: { count: row.count + 1 } });
    return true;
  });
}

export type SendResult = { ok: true; dev: boolean; retryAfterSec: number } | { ok: false; message: string; retryAfterSec?: number };

/** Create a code for `phone` (canonical) and send it. `ip` limits how many numbers one address may try. */
export async function sendOtp(phone: string, ip: string | null): Promise<SendResult> {
  const last = await db.customerOtp.findFirst({ where: { phone }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last) {
    const wait = RESEND_AFTER_SEC - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
    if (wait > 0) return { ok: false, message: `Please wait ${wait} seconds before asking for another code.`, retryAfterSec: wait };
  }
  if (!(await hit(`otp-phone:${phone}`, MAX_SENDS_PER_HOUR, 3600_000))) return { ok: false, message: "Too many codes were asked for this number. Please try again in an hour." };
  if (ip && !(await hit(`otp-ip:${ip}`, 20, 3600_000))) return { ok: false, message: "Too many requests from your network. Please try again later." };

  const code = devOtp ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (!devOtp) {
    if (!smsConfigured()) return { ok: false, message: "Sign-in by SMS is not available right now." };
    const sent = await sendSms(phone, `Your ${site.name} sign-in code is ${code}. It is valid for 5 minutes. Do not share it.`);
    if (!sent.ok) {
      console.error(`[sms] code for ${formatPhone(phone)} was not sent: ${sent.error}`);
      return { ok: false, message: "The code could not be sent. Please check the number and try again." };
    }
  }
  // Older codes of this number stop working: only the newest one is valid.
  await db.customerOtp.updateMany({ where: { phone, consumed: false }, data: { consumed: true } });
  await db.customerOtp.create({ data: { phone, codeHash: codeHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  // Keep the table small.
  await db.customerOtp.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  return { ok: true, dev: Boolean(devOtp), retryAfterSec: RESEND_AFTER_SEC };
}

export type VerifyResult = { ok: true; token: string; customerId: string } | { ok: false; message: string };

/** Check a code; on success the customer exists (made on first sign-in) and a session is created. */
export async function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  const otp = await db.customerOtp.findFirst({ where: { phone, consumed: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!otp) return { ok: false, message: "This code has expired. Ask for a new one." };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, message: "Too many wrong codes. Ask for a new one." };
  await db.customerOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
  if (!same(otp.codeHash, codeHash(phone, code))) return { ok: false, message: "That code is not right." };
  await db.customerOtp.update({ where: { id: otp.id }, data: { consumed: true } });
  const customer = await db.customer.upsert({ where: { phone }, create: { phone }, update: {}, select: { id: true } });
  const token = randomBytes(32).toString("base64url");
  await db.customerSession.create({ data: { customerId: customer.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) } });
  await db.customerSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { ok: true, token, customerId: customer.id };
}

export async function setCustomerCookie(token: string) {
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function clearCustomerSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.customerSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  jar.delete(COOKIE);
}

export interface CurrentCustomer {
  id: string;
  phone: string;
  fullName: string;
  country: string;
  district: string;
  address: string;
}

/** The signed-in customer of this request, or null. */
export const getCustomer = cache(async (): Promise<CurrentCustomer | null> => {
  await connection(); // the answer depends on the request and on the time: never prepared in advance
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.customerSession.findUnique({ where: { tokenHash: tokenHash(token) }, select: { expiresAt: true, customer: { select: { id: true, phone: true, fullName: true, country: true, district: true, address: true } } } });
  return s && s.expiresAt > new Date() ? s.customer : null;
});
