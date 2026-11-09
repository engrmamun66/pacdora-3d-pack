/**
 * Starter categories (seeded; admins can rename, reorder, add and delete them).
 * "All" is not a category: it means "no filter" in the template browser.
 */
export type CategoryKind = "use" | "model";

export const CATEGORY_KINDS: { kind: CategoryKind; label: string }[] = [
  { kind: "use", label: "By uses" },
  { kind: "model", label: "By models" },
];

export const SEED_CATEGORIES: Record<CategoryKind, string[]> = {
  use: [
    "Gift Boxes", "DIY Boxes", "Shipping Boxes", "Mailer Boxes", "Food", "Toys", "Coffee", "Tobacco",
    "Personal Care", "Beverage", "Office", "Barbie Box", "Candies", "Medicine", "Alcohol", "Milk & Yogurt",
  ],
  model: [
    "FEFCO Boxes", "Folding Boxes", "Tray Boxes", "Display Boxes", "Tuck End Boxes", "Box Inserts", "Paper Bags",
    "Rigid Boxes", "Window Boxes", "Boxes with Lid", "Storage Boxes", "Tuck End Box Variations", "Envelopes",
    "Sleeves", "Folders", "Cards & Tags", "Polygonal Boxes", "Sphere Boxes", "Triangle Boxes", "Pouches", "Others",
  ],
};

/** Where the built-in parametric templates start out. Applied only to templates that have no category yet. */
export const BUILTIN_CATEGORY_LINKS: Record<string, { use: string[]; model: string[] }> = {
  "straight-tuck-end-box": { use: [], model: ["tuck-end-boxes", "folding-boxes"] },
  "reverse-tuck-end-box": { use: [], model: ["tuck-end-boxes", "folding-boxes", "tuck-end-box-variations"] },
  "tuck-end-box-with-slit-locks": { use: [], model: ["tuck-end-box-variations", "folding-boxes"] },
  "crash-lock-bottom-box": { use: [], model: ["folding-boxes"] },
  "regular-slotted-shipping-box": { use: ["shipping-boxes"], model: ["fefco-boxes"] },
};
