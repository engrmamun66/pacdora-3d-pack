import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { LIMITS, takeToken } from "@/server/limits";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });
const body = z.object({ artworkId: z.string().min(1).max(60), favorite: z.boolean() });

/** Star or un-star one library picture for the signed-in customer. Setting the same state twice is harmless. */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;

  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(400, "Invalid request.");
  if (!(await takeToken(userId, "favorite", LIMITS.favorite.max, LIMITS.favorite.windowSec))) return fail(429, "Too many changes. Please wait a minute.");

  const { artworkId, favorite } = p.data;
  if (favorite) {
    const exists = await db.artworkItem.findUnique({ where: { id: artworkId }, select: { id: true } });
    if (!exists) return fail(404, "Picture not found.");
    await db.artworkFavorite.upsert({ where: { userId_artworkId: { userId, artworkId } }, create: { userId, artworkId }, update: {} });
  } else {
    await db.artworkFavorite.deleteMany({ where: { userId, artworkId } });
  }
  return NextResponse.json({ ok: true });
}
