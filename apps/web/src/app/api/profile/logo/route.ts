import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { isSameOrigin } from "@/server/same-origin";
import { LIMITS, takeToken } from "@/server/limits";
import { MAX_LOGO_BYTES, removeBusinessLogo, saveBusinessLogo } from "@/server/business-logo";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Set the signed-in Client's business logo. Multipart field "file" (PNG or JPEG, 2 MB at most). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;
  if (!(await takeToken(userId, "upload", LIMITS.upload.max, LIMITS.upload.windowSec))) return fail(429, "Too many uploads. Please wait a minute.");
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "Content-Length is required.");
  if (declared > MAX_LOGO_BYTES + 64 * 1024) return fail(413, "The logo is larger than 2 MB.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected a multipart form upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No file uploaded.");
  const r = await saveBusinessLogo(userId, new Uint8Array(await file.arrayBuffer()));
  if (!r.ok) return fail(r.status, r.message);
  revalidatePath("/my-dashboard");
  return NextResponse.json({ ok: true });
}

/** Remove the signed-in Client's business logo. */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  await removeBusinessLogo(session.user.id);
  revalidatePath("/my-dashboard");
  return NextResponse.json({ ok: true });
}
