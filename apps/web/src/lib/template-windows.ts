import { z } from "zod";
import { MAX_WINDOWS, type WindowSpec } from "@packaging/dieline-engine";
import { windowSchema } from "@packaging/schema";

/** The window holes an admin saved with a template (what new projects start with). Anything not valid reads as none. */
export function readTemplateWindows(value: unknown): WindowSpec[] {
  const p = z.array(windowSchema).max(MAX_WINDOWS).safeParse(value);
  return p.success ? (p.data as WindowSpec[]) : [];
}

export const templateWindowsSchema = z.array(windowSchema).max(MAX_WINDOWS);
