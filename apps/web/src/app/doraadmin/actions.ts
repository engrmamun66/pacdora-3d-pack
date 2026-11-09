"use server";

import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { SUPERADMIN, requireSuperAdmin } from "@/server/admin";
import { HERO_TAG } from "@/server/site-settings";
import { heroSettingsSchema } from "@/lib/hero-settings";

/**
 * Called by the admin login form right after a normal email/password sign-in.
 * Only a super admin may stay signed in here: anyone else is signed out again,
 * so the admin login cannot be used to probe which accounts are admins.
 */
export async function confirmAdminSession(): Promise<boolean> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return false;
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, banned: true, emailVerified: true } });
  if (user && user.role === SUPERADMIN && !user.banned && user.emailVerified) return true;
  await auth.api.signOut({ headers: h });
  return false;
}

const banSchema = z.object({
  userId: z.string().min(1).max(100),
  ban: z.enum(["0", "1"]),
  reason: z.string().trim().max(200).optional(),
});

export type AdminActionResult = { ok: boolean; message: string };

/** Suspend or restore a customer account. Super admins cannot be suspended here. */
export async function setBanned(formData: FormData): Promise<AdminActionResult> {
  const admin = await requireSuperAdmin();
  const parsed = banSchema.safeParse({
    userId: formData.get("userId"),
    ban: formData.get("ban"),
    reason: (formData.get("reason") as string | null) || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { userId, ban, reason } = parsed.data;
  if (userId === admin.id) return { ok: false, message: "You cannot suspend your own account." };
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return { ok: false, message: "User not found." };
  if (target.role === SUPERADMIN) return { ok: false, message: "Super admins cannot be suspended here." };

  if (ban === "1") {
    // Flag and end every session in one transaction: nobody stays signed in.
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { banned: true, bannedAt: new Date(), banReason: reason ?? null } }),
      db.session.deleteMany({ where: { userId } }),
    ]);
  } else {
    await db.user.update({ where: { id: userId }, data: { banned: false, bannedAt: null, banReason: null } });
  }
  revalidatePath("/doraadmin/users");
  revalidatePath("/doraadmin");
  return { ok: true, message: ban === "1" ? "User suspended and signed out everywhere." : "User restored." };
}

export type HeroFormState = { ok: boolean; message: string | null };

/** Save the home page hero options. Validated again here: never trust the form. */
export async function saveHeroSettings(_prev: HeroFormState, formData: FormData): Promise<HeroFormState> {
  const admin = await requireSuperAdmin();
  const useDefault = formData.get("useDefaultBackground") === "1";
  const parsed = heroSettingsSchema.safeParse({
    initial: formData.get("initial"),
    background: useDefault ? null : formData.get("background"),
    boxBackground: formData.get("useDefaultBoxBackground") === "1" ? null : formData.get("boxBackground"),
    boxColor: formData.get("useDefaultBoxColor") === "1" ? null : formData.get("boxColor"),
  });
  if (!parsed.success) return { ok: false, message: "Please choose a position and a colour like #1a2b3c." };
  await db.siteSetting.upsert({
    where: { key: "hero" },
    create: { key: "hero", value: parsed.data, updatedById: admin.id },
    update: { value: parsed.data, updatedById: admin.id },
  });
  updateTag(HERO_TAG); // the home page shows the change on the next visit
  return { ok: true, message: "Saved. The home page now uses these settings." };
}
