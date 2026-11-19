import "server-only";
import { cache } from "react";
import { db } from "./db";
import { isHash, newShareHash, templateHash } from "./share-hash";
import { projectThumbnail } from "@/lib/dieline-preview";
import { z } from "zod";
import { artworkSchema, parseProjectDoc, projectDocV1, type Artwork, type ProjectDoc } from "@packaging/schema";
import { IMPORTED_GENERATOR_ID, type FlatDieline, type FoldSetup, type WatermarkSpec, type WindowSpec } from "@packaging/dieline-engine";
import { loadImportedSource } from "./imported-templates";
import { readViewSettings, type ViewSettings } from "@/lib/view-settings";
import { getWatermark } from "./site-settings";
import { businessLogoUrl } from "./business-logo";
import { captureUrl } from "./captures";

/**
 * The public side of a Client (a signed-in user): their shared template pages.
 *
 * Addresses (the user hash is the hash of the Client's "all" link and starts every one):
 *   /{user}/templates                               all templates
 *   /{user}/{category or tag link}/templates        one category or one tag
 *   /{user}/templates/{template}                    one template (also under a category or tag link)
 * A link can be switched off; its address stays and works again when it is switched on.
 */
export type LinkScope = "all" | "category" | "tag" | "template";

export interface PortalOwner {
  userId: string;
  /** What the page calls the Client: the business name, else the name. */
  title: string;
  userHash: string;
  allActive: boolean;
  /** Address of the Client's logo for the header, or null when they have none. */
  logoUrl: string | null;
  /** How the pages show the templates: cards per row (2 to 6), and which picture is on a card. */
  cardColumns: number;
  cardImage: CardImage;
}

/** What a card shows: the flat dieline, or the 3D picture the Client took in the online design page (the dieline when there is none). */
export type CardImage = "dieline" | "3d";
export const CARD_IMAGES: readonly CardImage[] = ["dieline", "3d"];
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 6;

export interface PortalTemplate {
  id: string;
  hash: string;
  name: string;
  templateName: string;
  thumbnail: string | null;
  /** The cover 3D picture (an address), if the Client took one. */
  cover: string | null;
  category: string | null;
  tags: string[];
}

/** Make sure the Client has the "all" link, and one for every category and tag. Safe to call often. */
export async function ensureLinks(userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`links:${userId}`}, 0))`;
    const [existing, cats, tags] = await Promise.all([
      tx.shareLink.findMany({ where: { userId, scope: { in: ["all", "category", "tag"] } }, select: { scope: true, targetId: true } }),
      tx.userCategory.findMany({ where: { userId }, select: { id: true } }),
      tx.userTag.findMany({ where: { userId }, select: { id: true } }),
    ]);
    const has = new Set(existing.map((l) => `${l.scope}:${l.targetId ?? ""}`));
    const want = [{ scope: "all", targetId: null as string | null }, ...cats.map((c) => ({ scope: "category", targetId: c.id as string | null })), ...tags.map((t) => ({ scope: "tag", targetId: t.id as string | null }))];
    for (const w of want) {
      if (has.has(`${w.scope}:${w.targetId ?? ""}`)) continue;
      await tx.shareLink.create({ data: { userId, scope: w.scope, targetId: w.targetId, hash: newShareHash() } });
    }
  });
}

/** The Client behind a user hash (the hash of their "all" link). Null when no such Client, or the account is suspended. */
export async function findOwner(userHash: string): Promise<PortalOwner | null> {
  if (!isHash(userHash)) return null;
  const link = await db.shareLink.findUnique({ where: { hash: userHash }, select: { scope: true, active: true, user: { select: { id: true, name: true, businessName: true, businessLogoKey: true, banned: true, cardColumns: true, cardImage: true } } } });
  if (!link || link.scope !== "all" || link.user.banned) return null;
  return { userId: link.user.id, title: link.user.businessName?.trim() || link.user.name, userHash, allActive: link.active, logoUrl: businessLogoUrl(userHash, link.user.businessLogoKey), cardColumns: Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, link.user.cardColumns)), cardImage: link.user.cardImage === "3d" ? "3d" : "dieline" };
}

/** `findOwner`, once per request (the layout and the page both ask). */
export const getOwner = cache(findOwner);

export interface PortalScope {
  kind: "all" | "category" | "tag";
  label: string;
  /** The link hash in the address (null for "all"). */
  linkHash: string | null;
}

/** The part of the address after the user hash: "all", or a category / tag link that is on. Null when it does not exist or is off. */
export async function findScope(owner: PortalOwner, linkHash: string | null): Promise<PortalScope | null> {
  if (linkHash === null) return owner.allActive ? { kind: "all", label: "All templates", linkHash: null } : null;
  if (!isHash(linkHash)) return null;
  const link = await db.shareLink.findFirst({ where: { hash: linkHash, userId: owner.userId, scope: { in: ["category", "tag"] }, active: true }, select: { scope: true, targetId: true } });
  if (!link?.targetId) return null;
  if (link.scope === "category") {
    const c = await db.userCategory.findFirst({ where: { id: link.targetId, userId: owner.userId }, select: { name: true } });
    return c ? { kind: "category", label: c.name, linkHash } : null;
  }
  const t = await db.userTag.findFirst({ where: { id: link.targetId, userId: owner.userId }, select: { name: true } });
  return t ? { kind: "tag", label: t.name, linkHash } : null;
}

const MAX_PORTAL_TEMPLATES = 300;

const projectSelect = {
  id: true,
  name: true,
  projectData: true,
  categoryId: true,
  template: { select: { name: true, source: true, thumbnail: true } },
  category: { select: { name: true } },
  tags: { select: { tag: { select: { name: true } } } },
  captures: { where: { cover: true }, select: { id: true, storageKey: true }, take: 1 },
} as const;

type Row = {
  id: string;
  name: string;
  projectData: unknown;
  template: { name: string; source: string; thumbnail: string | null };
  category: { name: string } | null;
  tags: { tag: { name: string } }[];
  captures: { id: string; storageKey: string }[];
};

function toTemplate(r: Row): PortalTemplate {
  let thumbnail: string | null = null;
  try {
    const doc = parseProjectDoc(r.projectData);
    thumbnail = projectThumbnail(r.template, doc.template.generatorId, doc.template.params);
  } catch {
    // a project file from a newer version: no preview
  }
  return { id: r.id, hash: templateHash(r.id), name: r.name, templateName: r.template.name, thumbnail, cover: r.captures[0] ? captureUrl(r.captures[0].id, r.captures[0].storageKey) : null, category: r.category?.name ?? null, tags: r.tags.map((t) => t.tag.name) };
}

/** Ids of this Client's templates that were switched off one by one (a template link that is off hides it everywhere). */
async function hiddenTemplateIds(userId: string): Promise<string[]> {
  const rows = await db.shareLink.findMany({ where: { userId, scope: "template", active: false, projectId: { not: null } }, select: { projectId: true } });
  return rows.flatMap((r) => (r.projectId ? [r.projectId] : []));
}

/** The templates a shared page lists. */
export async function listPortalTemplates(owner: PortalOwner, scope: PortalScope): Promise<PortalTemplate[]> {
  const link = scope.linkHash ? await db.shareLink.findFirst({ where: { hash: scope.linkHash, userId: owner.userId }, select: { scope: true, targetId: true } }) : null;
  const hidden = await hiddenTemplateIds(owner.userId);
  const rows = await db.project.findMany({
    where: {
      userId: owner.userId,
      layoutDesign: null,
      ...(hidden.length ? { id: { notIn: hidden } } : {}),
      ...(link?.scope === "category" ? { categoryId: link.targetId } : link?.scope === "tag" ? { tags: { some: { tagId: link.targetId ?? "" } } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_PORTAL_TEMPLATES,
    select: projectSelect,
  });
  return rows.map(toTemplate);
}

/** A shared page address (path only) for the sitemap. */
export interface SharedPage {
  path: string;
  updatedAt: Date | null;
}

/**
 * Every shared page that is on: for each Client whose "all" link is on (and who is not suspended) the list, the lists of their
 * category and tag links that are on, and each template that is not switched off (at most MAX_PORTAL_TEMPLATES a Client,
 * the same as the pages show). Paths only; the caller adds the site address.
 */
export async function listSharedPages(limit: number): Promise<SharedPage[]> {
  const alls = await db.shareLink.findMany({ where: { scope: "all", active: true, user: { banned: false } }, select: { userId: true, hash: true } });
  if (alls.length === 0) return [];
  const userHash = new Map(alls.map((l) => [l.userId, l.hash]));
  const userIds = [...userHash.keys()];
  const [links, hidden, projects] = await Promise.all([
    db.shareLink.findMany({ where: { userId: { in: userIds }, scope: { in: ["category", "tag"] }, active: true }, select: { userId: true, hash: true } }),
    db.shareLink.findMany({ where: { userId: { in: userIds }, scope: "template", active: false, projectId: { not: null } }, select: { projectId: true } }),
    db.project.findMany({ where: { userId: { in: userIds } }, orderBy: { updatedAt: "desc" }, select: { id: true, userId: true, updatedAt: true }, take: limit }),
  ]);
  const off = new Set(hidden.flatMap((h) => (h.projectId ? [h.projectId] : [])));
  const pages: SharedPage[] = alls.map((l) => ({ path: `/${l.hash}/templates`, updatedAt: null }));
  for (const l of links) pages.push({ path: `/${userHash.get(l.userId)}/${l.hash}/templates`, updatedAt: null });
  const perUser = new Map<string, number>();
  for (const pr of projects) {
    if (off.has(pr.id)) continue;
    const n = perUser.get(pr.userId) ?? 0;
    if (n >= MAX_PORTAL_TEMPLATES) continue;
    perUser.set(pr.userId, n + 1);
    pages.push({ path: `/${userHash.get(pr.userId)}/templates/${templateHash(pr.id)}`, updatedAt: pr.updatedAt });
  }
  return pages;
}

/** One template by its hash, when this shared page may show it (it is in the scope and not switched off). */
export async function findPortalTemplate(owner: PortalOwner, scope: PortalScope, hash: string): Promise<PortalTemplate | null> {
  if (!isHash(hash)) return null;
  const ids = await db.project.findMany({ where: { userId: owner.userId }, select: { id: true } });
  const id = ids.find((p) => templateHash(p.id) === hash)?.id;
  if (!id) return null;
  const all = await listPortalTemplates(owner, scope);
  return all.find((t) => t.id === id) ?? null;
}

/** Templates of this Client by their hashes, as far as the whole portal (the "all" scope) may show them. Used to check an order. */
export async function findOrderableTemplates(owner: PortalOwner, hashes: string[]): Promise<Map<string, PortalTemplate>> {
  const wanted = new Set(hashes.filter(isHash));
  if (!wanted.size) return new Map();
  const ids = await db.project.findMany({ where: { userId: owner.userId }, select: { id: true } });
  const pick = ids.filter((p) => wanted.has(templateHash(p.id))).map((p) => p.id);
  const hidden = new Set(await hiddenTemplateIds(owner.userId));
  const rows = await db.project.findMany({ where: { userId: owner.userId, layoutDesign: null, id: { in: pick.filter((i) => !hidden.has(i)) } }, select: projectSelect });
  return new Map(rows.map((r) => [templateHash(r.id), toTemplate(r)]));
}

/** Everything the 3D view of one shared template needs (the same inputs the editor builds its box from). */
export interface PortalScene {
  generatorId: string;
  params: Record<string, number | string | boolean>;
  windows: WindowSpec[];
  imported: { templateId: string; flat: FlatDieline; fold: FoldSetup | null } | null;
  artwork: Artwork;
  threeD: ProjectDoc["threeD"];
  initialView: ViewSettings | null;
  watermark: WatermarkSpec | null;
  /** The design samples (3D pictures the Client kept), newest first. */
  captures: PortalCapture[];
}

/** One design sample: its picture (exactly what the Client saw) and how it was set up. Its design is fetched when it is opened (`loadCaptureDesign`). */
export interface PortalCapture {
  id: string;
  url: string;
  layoutName: string | null;
  progress: number;
  view: ViewSettings | null;
}

/** The design a sample was taken with: what replaces the template's own box size, windows, artwork and colours while the sample is shown. */
export type CaptureDesign = Pick<PortalScene, "params" | "windows" | "artwork" | "threeD">;

/** The 3D scene of a template the Client shares. Null when the project file cannot be read. */
export async function loadPortalScene(owner: PortalOwner, projectId: string): Promise<PortalScene | null> {
  const row = await db.project.findFirst({ where: { id: projectId, userId: owner.userId }, select: { projectData: true, template: { select: { viewSettings: true } } } });
  if (!row) return null;
  let doc: ProjectDoc;
  try {
    doc = parseProjectDoc(row.projectData);
  } catch {
    return null;
  }
  const captureRows = await db.projectCapture.findMany({ where: { projectId, userId: owner.userId }, orderBy: { createdAt: "desc" }, select: { id: true, storageKey: true, layoutName: true, progress: true, view: true } });
  const captures: PortalCapture[] = captureRows.map((c) => ({ id: c.id, url: captureUrl(c.id, c.storageKey), layoutName: c.layoutName, progress: c.progress, view: readViewSettings(c.view) }));
  let imported: PortalScene["imported"] = null;
  if (doc.template.generatorId === IMPORTED_GENERATOR_ID) {
    const src = await loadImportedSource(doc.template.presetId);
    if (!src) return null;
    imported = { templateId: src.templateId, flat: src.flat as FlatDieline, fold: (src.fold ?? null) as FoldSetup | null };
  }
  return {
    generatorId: doc.template.generatorId,
    params: doc.template.params as PortalScene["params"],
    windows: (doc.windows ?? []) as WindowSpec[],
    imported,
    artwork: doc.artwork,
    threeD: doc.threeD,
    initialView: readViewSettings(row.template.viewSettings),
    watermark: await getWatermark(),
    captures,
  };
}

const captureDesignSchema = z.object({
  params: z.record(z.string().max(60), z.union([z.number().finite(), z.string().max(100), z.boolean()])),
  windows: z.array(z.unknown()).max(50),
  artwork: artworkSchema,
  threeD: projectDocV1.shape.threeD,
});

/**
 * The design of one sample of a template the Client shares, or null (the template is switched off, the sample is not theirs, or it was
 * taken before samples kept their design: then the page shows the template as it is, with the sample's fold and camera).
 */
export async function loadCaptureDesign(owner: PortalOwner, captureId: string): Promise<CaptureDesign | null> {
  if (typeof captureId !== "string" || captureId.length > 40) return null;
  const row = await db.projectCapture.findFirst({ where: { id: captureId, userId: owner.userId }, select: { projectId: true, design: true } });
  if (!row?.design) return null;
  if ((await hiddenTemplateIds(owner.userId)).includes(row.projectId)) return null;
  const parsed = captureDesignSchema.safeParse(row.design);
  return parsed.success ? (parsed.data as unknown as CaptureDesign) : null;
}

/** May a picture be shown on this Client's shared pages? It is theirs, and a template that is not switched off uses it. */
export async function portalAssetAllowed(owner: PortalOwner, assetId: string): Promise<boolean> {
  if (!/^[\w-]{1,64}$/.test(assetId)) return false;
  const hidden = await hiddenTemplateIds(owner.userId);
  const like = `%${assetId}%`;
  // A picture counts when the template uses it now, or one of its design samples was taken with it.
  const rows = await db.$queryRaw<{ id: string }[]>`select p.id from project p where p."userId" = ${owner.userId} and not (p.id = any(${hidden}::text[])) and (p."projectData"::text like ${like} or exists (select 1 from project_capture c where c."projectId" = p.id and c.design::text like ${like})) limit 1`;
  return rows.length > 0;
}

/** How a Client's shared pages are branded: the name and the logo (an address, or null). Makes sure the links exist, so the logo address can be built. */
export async function getBrand(userId: string): Promise<{ name: string; logoUrl: string | null }> {
  await ensureLinks(userId);
  const [user, all] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, businessName: true, businessLogoKey: true } }),
    db.shareLink.findFirst({ where: { userId, scope: "all" }, select: { hash: true } }),
  ]);
  return { name: user?.businessName?.trim() || user?.name || "", logoUrl: all ? businessLogoUrl(all.hash, user?.businessLogoKey ?? null) : null };
}
