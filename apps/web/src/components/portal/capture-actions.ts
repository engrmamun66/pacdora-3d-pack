"use server";

import { getOwner, loadCaptureDesign, type CaptureDesign } from "@/server/portal";

/** The design of one design sample on a shared template page (open to anyone who has the page, like the page itself). Null when there is none to show. */
export async function getCaptureDesign(userHash: unknown, captureId: unknown): Promise<CaptureDesign | null> {
  if (typeof userHash !== "string" || typeof captureId !== "string") return null;
  const owner = await getOwner(userHash);
  return owner ? loadCaptureDesign(owner, captureId) : null;
}
