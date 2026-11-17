import "server-only";
import { env } from "./env";

/**
 * MiMSMS gateway (https://api.mimsms.com). One transactional SMS to one number.
 * The credentials come from the environment (MIMSMS_USERNAME, MIMSMS_API_KEY, MIMSMS_SENDER_NAME) and are never logged.
 */
const BASE = "https://api.mimsms.com/api/SmsSending";

export interface SmsResult {
  ok: boolean;
  /** A short reason for the log when not ok. Never contains the credentials. */
  error?: string;
}

export const smsConfigured = () => Boolean(env.MIMSMS_USERNAME && env.MIMSMS_API_KEY && env.MIMSMS_SENDER_NAME);

async function post(path: string, body: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

/** The gateway answers {"statusCode":"200","status":"Success",...} when it took the message. */
const accepted = (j: Record<string, unknown> | null) => j !== null && (String(j.statusCode ?? "") === "200" || String(j.status ?? "").toLowerCase() === "success");

/** `phone` in canonical form (8801XXXXXXXXX). */
export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  if (!smsConfigured()) return { ok: false, error: "SMS is not set up (MIMSMS_* variables are missing)." };
  try {
    const { status, json } = await post("SMS", {
      ApiKey: env.MIMSMS_API_KEY!,
      MobileNumber: phone,
      SenderName: env.MIMSMS_SENDER_NAME!,
      UserName: env.MIMSMS_USERNAME!,
      TransactionType: "T",
      Message: message,
      CampaignId: "null",
    });
    if (status >= 200 && status < 300 && accepted(json)) return { ok: true };
    return { ok: false, error: `The SMS gateway refused the message (${status}${json?.statusCode ? `, ${String(json.statusCode)}` : ""}${json?.responseResult ? `: ${String(json.responseResult).slice(0, 120)}` : ""}).` };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "The SMS gateway did not answer in time." : "The SMS gateway could not be reached." };
  }
}

/** Remaining SMS balance as the gateway reports it (a text such as "12.5"), or null. For the Client/admin to check. */
export async function smsBalance(): Promise<string | null> {
  if (!smsConfigured()) return null;
  try {
    const { json } = await post("balanceCheck", { UserName: env.MIMSMS_USERNAME!, Apikey: env.MIMSMS_API_KEY! });
    const v = json?.responseResult ?? json?.balance ?? null;
    return v === null ? null : String(v).slice(0, 60);
  } catch {
    return null;
  }
}
