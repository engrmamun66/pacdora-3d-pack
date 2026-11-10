"use server";

import { requireUser } from "@/server/session";
import { getPublicCatalogue, type PublicCategory, type PublicTemplate } from "@/server/templates-public";

/** The published templates (cached) for the "Dielines" list on the dieline page. Signed-in users only. */
export async function loadTemplatePicker(): Promise<{ templates: PublicTemplate[]; categories: PublicCategory[] }> {
  await requireUser();
  const { templates, categories } = await getPublicCatalogue();
  return { templates, categories };
}
