import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../generated/prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));

// A tiny stand-in for the project table: only what project-names asks of it.
let rows: { id: string; userId: string; name: string; slug: string }[] = [];
const ci = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
vi.mock("./db", () => ({
  db: {
    project: {
      findFirst: async ({ where }: { where: { userId: string; name?: { equals: string }; slug?: string; id?: { not: string } } }) =>
        rows.find((r) => r.userId === where.userId && (where.name ? ci(r.name, where.name.equals) : true) && (where.slug ? r.slug === where.slug : true) && (where.id ? r.id !== where.id.not : true)) ?? null,
      findMany: async ({ where }: { where: { userId: string; slug?: { startsWith: string }; name?: { startsWith: string } } }) =>
        rows.filter((r) => r.userId === where.userId && (where.slug ? r.slug.startsWith(where.slug.startsWith) : true) && (where.name ? r.name.toLowerCase().startsWith(where.name.startsWith.toLowerCase()) : true)),
    },
  },
}));

const { claimNameAndSlug, nameTaken, uniqueName, uniqueSlug } = await import("./project-names");

beforeEach(() => {
  rows = [
    { id: "p1", userId: "u1", name: "Crash-lock bottom box", slug: "crash-lock-bottom-box" },
    { id: "p2", userId: "u1", name: "Crash-lock bottom box 2", slug: "crash-lock-bottom-box-2" },
    { id: "p3", userId: "u2", name: "Mine", slug: "mine" },
  ];
});

describe("project names and slugs", () => {
  it("compares names without caring about capital letters, and only within one client", async () => {
    expect(await nameTaken("u1", "CRASH-LOCK bottom BOX")).toBe(true);
    expect(await nameTaken("u1", "Mine")).toBe(false);
    expect(await nameTaken("u1", "Crash-lock bottom box", "p1")).toBe(false);
  });

  it("counts up to the first free name and slug", async () => {
    expect(await uniqueName("u1", "Crash-lock bottom box")).toBe("Crash-lock bottom box 3");
    expect(await uniqueSlug("u1", "Crash-lock bottom box")).toBe("crash-lock-bottom-box-3");
    expect(await uniqueSlug("u1", "Brand new")).toBe("brand-new");
  });

  it("is strict when the client typed the name and slug", async () => {
    expect(await claimNameAndSlug("u1", "Crash-lock bottom box", null, true)).toMatchObject({ error: expect.stringContaining("already have a project named") });
    expect(await claimNameAndSlug("u1", "Brand new", "crash-lock-bottom-box", true)).toMatchObject({ error: expect.stringContaining("used by another") });
    expect(await claimNameAndSlug("u1", "Brand new", "Bad Slug", true)).toMatchObject({ error: expect.stringContaining("small letters") });
    expect(await claimNameAndSlug("u1", "Brand new", "brand-new", true)).toEqual({ name: "Brand new", slug: "brand-new" });
    expect(await claimNameAndSlug("u1", "Brand new", null, true)).toEqual({ name: "Brand new", slug: "brand-new" });
    expect(await claimNameAndSlug("u2", "Crash-lock bottom box", null, true)).toEqual({ name: "Crash-lock bottom box", slug: "crash-lock-bottom-box" });
  });

  it("only adds a number when a plain save finds the name taken", async () => {
    expect(await claimNameAndSlug("u1", "Crash-lock bottom box", null, false)).toEqual({ name: "Crash-lock bottom box 3", slug: "crash-lock-bottom-box-3" });
    expect(await claimNameAndSlug("u1", "Fresh", null, false)).toEqual({ name: "Fresh", slug: "fresh" });
  });
});
