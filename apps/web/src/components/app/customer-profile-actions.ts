"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

import type { ProfileState } from "./profile-actions";

/** Empty = not set. Digits with an optional leading + and the usual separators, 6-20 characters. */
const phone = z
  .string()
  .trim()
  .max(20, "A phone number can have at most 20 characters.")
  .refine((v) => v === "" || /^\+?[0-9][0-9\s\-().]{5,19}$/.test(v), "Enter a valid phone number, for example +880 1712 345678.");

const schema = z.object({
  name: z.string().trim().min(1, "Username is required.").max(100, "Username is too long (100 characters max)."),
  phone,
  altPhone: phone,
  businessName: z.string().trim().max(120, "Business name is too long (120 characters max)."),
  businessAddress: z.string().trim().max(300, "Business address is too long (300 characters max)."),
});

const text = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/** Save the customer's profile details (profile settings tab). Re-checks the session: never trust the proxy alone. */
export async function updateCustomerProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    altPhone: text(formData, "altPhone"),
    businessName: text(formData, "businessName"),
    businessAddress: text(formData, "businessAddress"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const v = parsed.data;
  // The name goes through the auth library so the signed-in session shows it at once.
  await auth.api.updateUser({ headers: await headers(), body: { name: v.name } });
  await db.user.update({
    where: { id: user.id },
    data: { phone: v.phone || null, altPhone: v.altPhone || null, businessName: v.businessName || null, businessAddress: v.businessAddress || null },
  });
  revalidatePath("/my-dashboard");
  return { ok: true, message: "Saved." };
}
