import { NextResponse } from "next/server";
import { z } from "zod";
import { setCustomerCookie, verifyOtp } from "@/server/customer-auth";
import { isSameOrigin } from "@/server/same-origin";
import { normalizeBdPhone } from "@/lib/phone";

const body = z.object({ phone: z.string().min(5).max(30), code: z.string().regex(/^\d{4,8}$/, "The code is numbers only.") });

/** Check the code; on success the customer is signed in (own cookie, separate from Client accounts). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  const phone = parsed.success ? normalizeBdPhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) return NextResponse.json({ error: parsed.success ? "That number is not right." : (parsed.error.issues[0]?.message ?? "Please enter the code.") }, { status: 400 });
  const r = await verifyOtp(phone, parsed.data.code);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  await setCustomerCookie(r.token);
  return NextResponse.json({ ok: true });
}
