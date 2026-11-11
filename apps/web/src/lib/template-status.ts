import { templateStatusConfig } from "@/config/template-statuses";

/** Where an admin's template is in its workflow. Names live in config/template-statuses.ts. Only "published" templates are shown to customers. */
export const TEMPLATE_STATUSES = templateStatusConfig;

export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number]["value"];

export const TEMPLATE_STATUS_VALUES = TEMPLATE_STATUSES.map((s) => s.value) as [TemplateStatus, ...TemplateStatus[]];

export function isTemplateStatus(v: unknown): v is TemplateStatus {
  return typeof v === "string" && (TEMPLATE_STATUS_VALUES as string[]).includes(v);
}

/** Unknown stored values read as draft, so a bad row is never shown to customers. */
export function templateStatus(v: unknown): TemplateStatus {
  return isTemplateStatus(v) ? v : "draft";
}

export function templateStatusLabel(v: unknown): string {
  return TEMPLATE_STATUSES.find((s) => s.value === v)?.label ?? "Draft";
}

/** Customers see a template only when it is published. */
export function isPublicStatus(v: TemplateStatus): boolean {
  return v === "published";
}
