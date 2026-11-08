"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { requireUser } from "@/server/session";

export type ProfileState = { ok: boolean; message: string | null };

const schema = z.object({ name: z.string().trim().min(1, "Name is required").max(100, "Name is too long") });

/** Update display name. Re-checks the session: never trust the proxy alone. */
export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  await requireUser();
  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  await auth.api.updateUser({ headers: await headers(), body: { name: parsed.data.name } });
  return { ok: true, message: "Saved." };
}
