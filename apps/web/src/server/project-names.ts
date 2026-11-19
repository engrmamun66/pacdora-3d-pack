import "server-only";
import { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { firstFree, isProjectSlug, projectSlug } from "../lib/project-slug";

/** Name and slug must be unique among one Client's own projects (names are compared without caring about capital letters). */
export async function nameTaken(userId: string, name: string, exceptId?: string): Promise<boolean> {
  const hit = await db.project.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  return hit !== null;
}

export async function slugTaken(userId: string, slug: string, exceptId?: string): Promise<boolean> {
  const hit = await db.project.findFirst({ where: { userId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  return hit !== null;
}

/** The first free slug starting from `wanted` (`box`, `box-2`, `box-3` ...). */
export async function uniqueSlug(userId: string, wanted: string): Promise<string> {
  const base = projectSlug(wanted);
  const used = new Set((await db.project.findMany({ where: { userId, slug: { startsWith: base } }, select: { slug: true } })).map((p) => p.slug));
  return firstFree(base, (c) => used.has(c));
}

/** The first free name starting from `wanted` ("Box", "Box 2", "Box 3" ...), for saves that are not asked to be exact. */
export async function uniqueName(userId: string, wanted: string, max = 120): Promise<string> {
  const used = new Set((await db.project.findMany({ where: { userId, name: { startsWith: wanted.slice(0, max - 6), mode: "insensitive" } }, select: { name: true } })).map((p) => p.name.toLowerCase()));
  const fit = (n: number) => (n === 1 ? wanted : `${wanted.slice(0, max - String(n).length - 1)} ${n}`);
  for (let n = 1; n < 10_000; n++) if (!used.has(fit(n).toLowerCase())) return fit(n);
  return `${wanted.slice(0, max - 14)} ${Date.now()}`;
}

export type NameAndSlug = { name: string; slug: string } | { error: string };

/**
 * The name and slug a new project is saved with. `strict`: the person typed them, so a taken one is an error that says
 * which. Not strict (a plain Save): a taken name just gets a number, so saving is never blocked.
 */
export async function claimNameAndSlug(userId: string, name: string, slug: string | null, strict: boolean): Promise<NameAndSlug> {
  if (!strict) {
    const finalName = await uniqueName(userId, name);
    return { name: finalName, slug: await uniqueSlug(userId, finalName) };
  }
  if (await nameTaken(userId, name)) return { error: `You already have a project named "${name}". Choose another name.` };
  if (slug !== null && slug !== "") {
    if (!isProjectSlug(slug)) return { error: "The slug can use small letters, digits and single dashes only (for example my-box-2)." };
    if (await slugTaken(userId, slug)) return { error: `The slug "${slug}" is used by another of your projects. Choose another.` };
    return { name, slug };
  }
  return { name, slug: await uniqueSlug(userId, name) };
}

/** True when a database error says the (user, slug) pair is taken: two saves raced for the same slug. */
export const isSlugClash = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
