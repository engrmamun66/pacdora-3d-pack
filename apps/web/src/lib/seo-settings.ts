import { z } from "zod";
import { isSafeHref } from "./site-content";

/**
 * Search-engine and social-share data of the public site, edited under Admin > Settings > SEO.
 * `{site}` in a title is replaced by the site name (Settings > Site Identity). Text only: nothing here is printed as HTML.
 */

const text = (max: number) => z.string().trim().max(max);
const url = z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//i.test(v), "Use a full address that starts with https://");
const pageSchema = z.object({ title: text(90), description: text(220) });

export const seoSettingsSchema = z.object({
  /** false = ask search engines to skip the whole site (for a site that is not ready). */
  indexing: z.boolean(),
  /** Title of every page that has no title of its own. Empty = the site name. */
  defaultTitle: text(90),
  /** Wraps a page's own title: "%s" is the page's title. */
  titleTemplate: text(90).refine((v) => v === "" || v.includes("%s"), "The pattern must contain %s, where the page title goes."),
  description: text(220),
  keywords: z.array(text(60).min(1)).max(25),
  /** Picture shown when a link is shared (1200 x 630). Empty = a card the site draws itself. */
  shareImage: url,
  /** Twitter / X account, like @name. Empty = none. */
  twitter: text(40).refine((v) => v === "" || /^@?[A-Za-z0-9_]{1,15}$/.test(v), "Use a handle like @yourname."),
  /** Codes that prove you own the site to Google and Bing. Empty = none. */
  googleVerification: text(120).refine((v) => /^[\w-]*$/.test(v), "Paste only the code, not the whole tag."),
  bingVerification: text(120).refine((v) => /^[\w-]*$/.test(v), "Paste only the code, not the whole tag."),
  /** Rich data that lets search engines show the product, its rating-free details and the questions as rich results. */
  structuredData: z.boolean(),
  /** The company's own pages on other sites (social, directories): they help search engines connect them to this site. */
  sameAs: z.array(url.refine((v) => v !== "", "A link cannot be empty.")).max(8),
  /** Tell search engines the tool can be used for free (a free offer in the structured data). */
  freeToUse: z.boolean(),
  pages: z.object({ home: pageSchema, dielines: pageSchema, register: pageSchema, login: pageSchema }),
});
export type SeoSettings = z.output<typeof seoSettingsSchema>;
export type SeoPageKey = keyof SeoSettings["pages"];

export const SEO_PAGES: { key: SeoPageKey; label: string; path: string; hint: string }[] = [
  { key: "home", label: "Home page", path: "/", hint: "The page most people find first. Put the main phrase people search for near the start of the title." },
  { key: "register", label: "Create an account", path: "/register", hint: "Shown when someone searches for the sign-up page." },
  { key: "login", label: "Log in", path: "/login", hint: "Shown when someone searches for the log-in page." },
];

/**
 * Starting data, written from a look at how the online packaging-design market is searched and where it is thin: people search for
 * "dieline generator", "box template", "custom box dieline", "3D box mockup" and file types like DXF, and most sites answer with a library
 * of fixed templates. This site's difference is that every dieline is calculated from the buyer's own size and folds in 3D, so the
 * words lead with that.
 */
export const DEFAULT_SEO: SeoSettings = {
  indexing: true,
  defaultTitle: "Free Dieline Generator: Custom Box Templates with 3D Preview | {site}",
  titleTemplate: "%s | {site}",
  description: "Make a custom box dieline from your own size in the browser. Add artwork, fold it in 3D and export print-ready PDF, AI, EPS, SVG and DXF files with cut and crease layers.",
  keywords: ["dieline generator", "box dieline", "custom box template", "packaging design software", "3D box mockup", "tuck end box template", "crash lock bottom box", "dieline DXF", "packaging dieline maker", "online box designer"],
  shareImage: "",
  twitter: "",
  googleVerification: "",
  bingVerification: "",
  structuredData: true,
  sameAs: [],
  freeToUse: true,
  pages: {
    home: { title: "", description: "" },
    dielines: {
      title: "Dieline Templates: Tuck End, Crash-Lock, Mailer & Shipping Boxes",
      description: "Browse box dieline templates. Open one, type your own width, depth and height, and get a dieline with cut, crease and bleed that folds in 3D and exports to PDF, AI, EPS, SVG or DXF.",
    },
    register: { title: "Create a free account", description: "Sign up free to build custom box dielines, place artwork on every panel, preview the folded box in 3D and download print-ready files." },
    login: { title: "Log in", description: "Log in to your workspace to open your dielines, artwork and 3D box previews." },
  },
};

/** Tolerant read of a stored value: anything unusable falls back to the defaults. */
export function parseSeoSettings(raw: unknown): SeoSettings {
  const r = seoSettingsSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_SEO;
}

/** Put the site name into a title that has the {site} marker. */
export const withSite = (s: string, site: string) => s.replaceAll("{site}", site).trim();

/** What a page's tab and search-result title will be: its own title with the pattern around it. */
export function fullTitle(own: string, settings: SeoSettings, site: string): string {
  const pattern = settings.titleTemplate || "%s | {site}";
  return withSite(pattern.replace("%s", own), site);
}

/** Longest a title / description usually shows before a search engine cuts it, for the length hints in the form. */
export const TITLE_HINT = 60;
export const DESCRIPTION_HINT = 160;

export { isSafeHref };
