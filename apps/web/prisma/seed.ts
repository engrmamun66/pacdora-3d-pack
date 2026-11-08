/**
 * Seed / sync the template catalogue table from code (code is the source of
 * truth for presets). Safe to run repeatedly: `npx prisma db seed`.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { getGenerator, templateCatalog } from "@packaging/dieline-engine";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  for (const t of templateCatalog) {
    const gen = getGenerator(t.generatorId);
    gen.generate(t.defaults); // never seed a preset that does not generate
    const data = {
      generatorId: t.generatorId,
      name: t.name,
      category: t.category,
      description: t.description,
      schemaVersion: gen.schemaVersion,
      defaultParameters: t.defaults as object,
      published: true,
    };
    await db.template.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
    console.log(`template ${t.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
