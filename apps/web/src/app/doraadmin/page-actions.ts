"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireSuperAdmin } from "@/server/admin";
import { SITE_CONTENT_TAG, writeSiteContentPart } from "@/server/site-content";
import { CONTENT_PARTS, DEFAULT_CONTENT, PART_SCHEMAS, normalizeSections, type ContentPart, type HomeContent, type SiteContent } from "@/lib/site-content";

export type PageActionResult = { ok: boolean; message: string };

const isPart = (v: unknown): v is ContentPart => typeof v === "string" && (CONTENT_PARTS as readonly string[]).includes(v);

/** Where in the form a rule was broken, in plain words: "features, item 2, title". */
function where(path: PropertyKey[]): string {
  return path.map((p) => (typeof p === "number" ? `item ${p + 1}` : String(p))).join(", ");
}

/**
 * Save one part of the public site's text (Admin > Pages). Everything is checked again here: lengths, the list sizes
 * and every link address. Text only is stored; the pages print it as text.
 */
export async function saveSiteContent(part: unknown, value: unknown): Promise<PageActionResult> {
  const admin = await requireSuperAdmin();
  if (!isPart(part)) return { ok: false, message: "Unknown page." };
  const parsed = PART_SCHEMAS[part].safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, message: `${issue.message}${issue.path.length ? ` (${where(issue.path)})` : ""}` };
  }
  const data = part === "home" ? { ...(parsed.data as HomeContent), sections: normalizeSections((parsed.data as HomeContent).sections) } : parsed.data;
  await writeSiteContentPart(part, data as SiteContent[typeof part], admin.id);
  updateTag(SITE_CONTENT_TAG);
  revalidatePath("/doraadmin/pages", "layout");
  return { ok: true, message: "Saved. The site shows it now." };
}

/** Put one part back to the built-in text. */
export async function resetSiteContent(part: unknown): Promise<PageActionResult> {
  const admin = await requireSuperAdmin();
  if (!isPart(part)) return { ok: false, message: "Unknown page." };
  await writeSiteContentPart(part, DEFAULT_CONTENT[part], admin.id);
  updateTag(SITE_CONTENT_TAG);
  revalidatePath("/doraadmin/pages", "layout");
  return { ok: true, message: "Back to the built-in text." };
}
