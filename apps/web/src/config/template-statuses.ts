/**
 * Template status names, in the order the admin dropdown shows them.
 *
 * Edit the `label` of any status here to rename it. Do NOT change `value`: it is what the
 * database stores (template.status). Only the status whose value is "published" is shown to
 * customers.
 */
export const templateStatusConfig = [
  { value: "draft", label: "Draft" },
  { value: "step-1", label: "Step 1" },
  { value: "step-2", label: "Step 2" },
  { value: "hide", label: "Hide" },
  { value: "published", label: "Published" },
  { value: "sealed", label: "Sealed" },
] as const;
