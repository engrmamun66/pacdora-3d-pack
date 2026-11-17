import { NextResponse } from "next/server";
import { clearCustomerSession } from "@/server/customer-auth";
import { isSameOrigin } from "@/server/same-origin";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  await clearCustomerSession();
  return NextResponse.json({ ok: true });
}
