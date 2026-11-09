/**
 * Seed / sync the template catalogue table from code (code is the source of
 * truth for presets). Safe to run repeatedly: `npx prisma db seed`.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { getGenerator, templateCatalog } from "@packaging/dieline-engine";
import { PrismaClient } from "../src/generated/prisma/client";
import { BUILTIN_CATEGORY_LINKS, CATEGORY_KINDS, SEED_CATEGORIES } from "../src/lib/category-data";
import { slugify } from "../src/lib/slug";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function seedCategories() {
  // Create what is missing; never overwrite names or order an admin has changed.
  for (const { kind } of CATEGORY_KINDS) {
    const names = SEED_CATEGORIES[kind];
    for (const [i, name] of names.entries()) {
      const slug = slugify(name);
      await db.templateCategory.upsert({
        where: { kind_slug: { kind, slug } },
        create: { kind, slug, name, sortOrder: (i + 1) * 10 },
        update: {},
      });
    }
    console.log(`categories ${kind}: ${names.length}`);
  }
}

async function main() {
  await seedCategories();
  for (const t of templateCatalog) {
    const gen = getGenerator(t.generatorId);
    gen.generate(t.defaults); // never seed a preset that does not generate
    // Code owns the generator and its defaults; admins own name, description, visibility and categories.
    const codeOwned = {
      generatorId: t.generatorId,
      category: t.category,
      schemaVersion: gen.schemaVersion,
      defaultParameters: t.defaults as object,
    };
    await db.template.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, description: t.description, published: true, source: "builtin", ...codeOwned },
      update: codeOwned,
    });
    // First seeding only: start each built-in in its categories.
    const links = BUILTIN_CATEGORY_LINKS[t.id];
    const has = await db.template.count({ where: { id: t.id, categories: { some: {} } } });
    if (links && !has) {
      const wanted = [
        ...links.use.map((slug) => ({ kind_slug: { kind: "use", slug } })),
        ...links.model.map((slug) => ({ kind_slug: { kind: "model", slug } })),
      ];
      await db.template.update({ where: { id: t.id }, data: { categories: { connect: wanted } } });
    }
    console.log(`template ${t.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
