import { z } from "zod";

/**
 * The words of the public site that an admin can change under Admin > Pages: the home page (hero text, which
 * sections show and in what order, and each section's content), the heading of the Templates page, the header
 * menu, the announcement bar, the footer, and the search-engine title and description.
 *
 * One stored value (site setting "site-content") with three parts. Each part is read on its own, so a part that
 * cannot be read falls back to its defaults without touching the others. Text only: no HTML is stored or rendered.
 */

const text = (max: number) => z.string().trim().max(max);

/**
 * An address a link may point at: a page of this site ("/templates"), a place on a page ("#faq", "/#faq"), a web
 * address or an email. Anything else (for example "javascript:") is refused.
 */
export const isSafeHref = (v: string) => /^(\/(?!\/)|#|https?:\/\/|mailto:)/i.test(v) && !/[\s<>"']/.test(v);
const href = z.string().trim().max(300).refine(isSafeHref, "Use an address like /templates, #faq or https://example.com.");

export const linkSchema = z.object({ label: text(60).min(1, "A link needs a label."), href });
export type SiteLink = z.output<typeof linkSchema>;
/** A button that can be left out: an empty label hides it. */
const optionalLinkSchema = z.object({ label: text(60), href: z.union([href, z.literal("")]) });

/** The sections of the home page under the hero, in the order they are listed here by default. */
export const HOME_SECTIONS = [
  { id: "tape", label: "Moving tape", hint: "A band of short words that scrolls by." },
  { id: "showcase", label: "Template showcase", hint: "A row of your published templates." },
  { id: "features", label: "Features", hint: "Cards with a small moving picture each." },
  { id: "steps", label: "How it works", hint: "The steps, in order." },
  { id: "formats", label: "File formats", hint: "The files a customer can download." },
  { id: "faq", label: "Questions", hint: "Questions and answers." },
  { id: "cta", label: "Closing call", hint: "The dark band with the last button." },
] as const;
export type HomeSectionId = (typeof HOME_SECTIONS)[number]["id"];
const SECTION_IDS = HOME_SECTIONS.map((s) => s.id) as [HomeSectionId, ...HomeSectionId[]];

/** The small moving picture of a feature card. */
export const FEATURE_VISUALS = [
  { id: "dieline", label: "Dieline drawing itself" },
  { id: "layers", label: "Artwork layers" },
  { id: "box", label: "Turning box" },
  { id: "prompt", label: "Typed request" },
  { id: "files", label: "Fanned files" },
  { id: "check", label: "Checklist" },
  { id: "none", label: "No picture" },
] as const;
export type FeatureVisual = (typeof FEATURE_VISUALS)[number]["id"];
const VISUAL_IDS = FEATURE_VISUALS.map((v) => v.id) as [FeatureVisual, ...FeatureVisual[]];

export const homeSchema = z.object({
  hero: z.object({
    badge: text(80),
    title: text(140).min(1, "The headline cannot be empty."),
    subtitle: text(300),
    primary: linkSchema,
    secondary: optionalLinkSchema,
    points: z.array(text(60).min(1)).max(5),
  }),
  /** Order and visibility of the sections under the hero. A section missing from a stored value is added at the end, switched on. */
  sections: z.array(z.object({ id: z.enum(SECTION_IDS), on: z.boolean() })).max(SECTION_IDS.length),
  tape: z.array(text(30).min(1)).max(16),
  showcase: z.object({ title: text(100), subtitle: text(300), count: z.number().int().min(3).max(16) }),
  features: z.object({
    title: text(100),
    subtitle: text(300),
    items: z.array(z.object({ title: text(60).min(1), body: text(300), visual: z.enum(VISUAL_IDS) })).max(9),
  }),
  steps: z.object({ title: text(100), subtitle: text(300), items: z.array(z.object({ title: text(60).min(1), body: text(300) })).max(6) }),
  formats: z.object({ title: text(100), subtitle: text(400), items: z.array(z.object({ label: text(12).min(1), note: text(80) })).max(12) }),
  faq: z.object({ title: text(100), subtitle: text(300), items: z.array(z.object({ q: text(160).min(1), a: text(700).min(1) })).max(14) }),
  cta: z.object({ title: text(100).min(1), subtitle: text(300), button: linkSchema }),
});
export type HomeContent = z.output<typeof homeSchema>;

export const templatesPageSchema = z.object({ title: text(80).min(1), subtitle: text(300) });
export type TemplatesPageContent = z.output<typeof templatesPageSchema>;

export const chromeSchema = z.object({
  announcement: z.object({ on: z.boolean(), text: text(140), link: optionalLinkSchema }),
  nav: z.array(linkSchema).max(6),
  footer: z.object({
    tagline: text(200),
    columns: z.array(z.object({ title: text(40).min(1), links: z.array(linkSchema).max(8) })).max(4),
    note: text(160),
  }),
});
export type ChromeContent = z.output<typeof chromeSchema>;

export interface SiteContent {
  home: HomeContent;
  templatesPage: TemplatesPageContent;
  chrome: ChromeContent;
}

export const CONTENT_PARTS = ["home", "templatesPage", "chrome"] as const;
export type ContentPart = (typeof CONTENT_PARTS)[number];
export const PART_SCHEMAS = { home: homeSchema, templatesPage: templatesPageSchema, chrome: chromeSchema } as const;

export const DEFAULT_CONTENT: SiteContent = {
  home: {
    hero: {
      badge: "Parametric packaging design",
      title: "Online dieline generator that folds in 3D",
      subtitle: "Make a custom box dieline from your own size, add artwork, fold it in 3D and export print-ready PDF, AI, EPS, SVG and DXF files, all in your browser.",
      primary: { label: "Create a free account", href: "/register" },
      secondary: { label: "Browse templates", href: "/templates" },
      points: ["Free to start", "Cut and crease layers", "Live 3D fold", "DXF, PDF, AI, EPS, SVG"],
    },
    sections: HOME_SECTIONS.map((s) => ({ id: s.id, on: true })),
    tape: ["Tuck end", "Crash-lock bottom", "Mailer box", "Shipping carton", "Cut", "Crease", "Bleed", "Safe area", "3D fold", "Print-ready"],
    showcase: { title: "Start from a real structure", subtitle: "Every template is a working dieline. Open one, change the size, and watch it fold.", count: 8 },
    features: {
      title: "Everything from sheet to shipment",
      subtitle: "One workspace for the dieline, the artwork, the 3D box and the files your printer needs.",
      items: [
        { title: "Exact dielines", body: "Enter width, depth and height. Cut, crease, glue, bleed and safe areas are calculated by rule, not drawn by hand.", visual: "dieline" },
        { title: "3D preview", body: "Watch the carton fold up with your artwork on the right faces, and turn it around.", visual: "box" },
        { title: "2D artwork", body: "Place text, logos and shapes on individual panels of the flat dieline, with guides, undo and alignment.", visual: "layers" },
        { title: "Describe a box", body: "Type what you need. The AI only suggests a template and sizes; the geometry engine checks every number.", visual: "prompt" },
        { title: "Print files", body: "PDF, Illustrator, EPS, SVG and DXF with separate cut and crease layers and named spot colours.", visual: "files" },
        { title: "Checked geometry", body: "Every dieline passes automatic checks: closed cut path, no overlaps, folds that close without collisions.", visual: "check" },
      ],
    },
    steps: {
      title: "How it works",
      subtitle: "Four steps from an empty sheet to files for the press.",
      items: [
        { title: "Pick a structure", body: "Start from a standard carton or shipping box: tuck end, crash-lock bottom or regular slotted." },
        { title: "Set size and board", body: "Give dimensions in mm or inches and choose the board. The sheet and the 3D box update as you type." },
        { title: "Add artwork", body: "Design on the flat sheet. Panels, bleed and safe areas stay in view." },
        { title: "Export for production", body: "Download print-ready files for your printer or cutting table." },
      ],
    },
    formats: {
      title: "Files your printer can use",
      subtitle: "Illustrator and EPS files target the version you pick. They have not yet been opened in every real Illustrator release, and the export dialog says so.",
      items: [
        { label: "PDF", note: "Print-ready, with layers" },
        { label: "AI", note: "Adobe Illustrator" },
        { label: "EPS", note: "For older workflows" },
        { label: "SVG", note: "Vector, for the web" },
        { label: "DXF", note: "For cutting tables" },
        { label: "PNG", note: "A picture of the sheet" },
        { label: "GLB", note: "The folded 3D box" },
      ],
    },
    faq: {
      title: "Questions, answered",
      subtitle: "",
      items: [
        { q: "What is a dieline?", a: "A dieline is the flat plan of a box or carton: the outline to cut, the lines to crease and fold, the glue flaps and the bleed. A printer or cutting table uses it to make the box from one sheet of board." },
        { q: "How do I make a custom box dieline?", a: "Pick a box style, type the width, depth and height in mm or inches and choose the board. The dieline is calculated from your size, and you can add artwork to each panel and fold the box in 3D." },
        { q: "Which dieline file formats can I download?", a: "PDF, Illustrator (AI), EPS, SVG and DXF for production, with separate cut and crease layers, PNG as a picture and GLB for the folded 3D box." },
        { q: "Is the dieline generator free?", a: "You can create a free account without a card and start from any template." },
        { q: "Which box styles are available?", a: "Tuck end cartons, crash-lock bottom boxes, regular slotted shipping boxes, reverse tuck boxes, gift and mailer boxes, and more. New templates are added all the time." },
        { q: "Do I need to install anything?", a: "No. The dieline, the artwork editor and the 3D preview all run in your browser." },
      ],
    },
    cta: { title: "Make your first dieline in a minute", subtitle: "Free account, no card. Start from a template and change the size.", button: { label: "Get started", href: "/register" } },
  },
  templatesPage: { title: "Templates", subtitle: "Pick a structure, change the size, and open it in 3D." },
  chrome: {
    announcement: { on: false, text: "", link: { label: "", href: "" } },
    nav: [
      { label: "Templates", href: "/templates" },
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how" },
      { label: "File formats", href: "/#formats" },
    ],
    footer: {
      tagline: "Parametric packaging dielines, 2D artwork and 3D preview in your browser.",
      columns: [
        { title: "Product", links: [{ label: "Templates", href: "/templates" }, { label: "Features", href: "/#features" }, { label: "How it works", href: "/#how" }, { label: "File formats", href: "/#formats" }] },
        { title: "Account", links: [{ label: "Log in", href: "/login" }, { label: "Create an account", href: "/register" }, { label: "My dashboard", href: "/my-dashboard" }] },
      ],
      note: "",
    },
  },
};

/** The stored section list made complete: unknown ids dropped, doubles dropped, and any section that is missing added at the end (on). */
export function normalizeSections(list: HomeContent["sections"]): HomeContent["sections"] {
  const seen = new Set<HomeSectionId>();
  const out = list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  for (const id of SECTION_IDS) if (!seen.has(id)) out.push({ id, on: true });
  return out;
}

/** Tolerant read of the stored value: every part that cannot be read falls back to its defaults. */
export function parseSiteContent(raw: unknown): SiteContent {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const part = <K extends ContentPart>(k: K): SiteContent[K] => {
    const r = PART_SCHEMAS[k].safeParse(src[k]);
    return (r.success ? r.data : DEFAULT_CONTENT[k]) as SiteContent[K];
  };
  const home = part("home");
  return { home: { ...home, sections: normalizeSections(home.sections) }, templatesPage: part("templatesPage"), chrome: part("chrome") };
}

/** How many of three columns each feature card takes: the first is wide, the last fills what is left of its row. */
export function featureSpans(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [3];
  const spans = [2, ...Array.from({ length: n - 1 }, () => 1)];
  const beforeLast = 2 + (n - 2);
  const rem = beforeLast % 3;
  spans[n - 1] = rem === 0 ? 3 : 3 - rem;
  return spans;
}
