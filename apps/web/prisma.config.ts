import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load env files itself. Next.js uses .env.local, so load it first.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
