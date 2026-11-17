import { NextResponse } from "next/server";
import { z } from "zod";
import { sendOtp } from "@/server/customer-auth";
import { clientIp } from "@/server/client-ip";
import { isSameOrigin } from "@/server/same-origin";
import { normalizeBdPhone } from "@/lib/phone";

const body = z.object({ phone: z.string().min(5).max(30) });

/** Send a sign-in code by SMS to a customer's mobile number. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  const phone = parsed.success ? normalizeBdPhone(parsed.data.phone) : null;
  if (!phone) return NextResponse.json({ error: "Please enter a Bangladesh mobile number, like 01712345678." }, { status: 400 });
  const r = await sendOtp(phone, clientIp(request));
  if (!r.ok) return NextResponse.json({ error: r.message, retryAfterSec: r.retryAfterSec ?? null }, { status: r.retryAfterSec ? 429 : 400 });
  return NextResponse.json({ ok: true, dev: r.dev, retryAfterSec: r.retryAfterSec, phone });
}
