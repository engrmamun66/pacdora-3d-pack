/**
 * Development helper: create (or reset) the default super admins listed in the
 * SEED_SUPERADMINS environment variable, as a JSON array:
 *   SEED_SUPERADMINS='[{"email":"a@example.com","password":"a long password"}]'
 * Put it in apps/web/.env.local (git-ignored). Passwords never live in the code.
 * Accounts are created verified, with the super-admin role. Refuses to run in production.
 *   npm run db:seed:admins
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });
config();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed default admins in production. Use `npm run admin:create` on a real account instead.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const raw = process.env.SEED_SUPERADMINS;
if (!raw) {
  console.error("SEED_SUPERADMINS is not set (see the comment at the top of prisma/seed-admins.ts).");
  process.exit(1);
}
const admins = z
  .array(z.object({ email: z.email(), password: z.string().min(10).max(128), name: z.string().min(1).max(100).optional() }))
  .min(1)
  .parse(JSON.parse(raw));

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  for (const a of admins) {
    const email = a.email.trim().toLowerCase();
    const hash = await hashPassword(a.password);
    const existing = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    const userId = existing?.id ?? randomUUID().replaceAll("-", "");
    if (existing) {
      await db.user.update({ where: { id: userId }, data: { role: "superadmin", emailVerified: true, banned: false, bannedAt: null, banReason: null } });
    } else {
      await db.user.create({ data: { id: userId, email, name: a.name ?? email.split("@")[0]!, emailVerified: true, role: "superadmin" } });
    }
    const account = await db.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true } });
    if (account) await db.account.update({ where: { id: account.id }, data: { password: hash } });
    else await db.account.create({ data: { id: randomUUID().replaceAll("-", ""), accountId: userId, providerId: "credential", userId, password: hash } });
    console.log(`${existing ? "Updated" : "Created"} super admin ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
