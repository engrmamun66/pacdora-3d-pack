/**
 * Server-side only: grant or remove the super-admin role.
 *   npm run admin:create -- someone@example.com
 *   npm run admin:create -- someone@example.com --revoke
 * The person must already have registered and confirmed their email. There is
 * deliberately no way to do this from the website.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:create -- <email> [--revoke]");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, email: true, emailVerified: true, banned: true, role: true } });
  if (!user) throw new Error(`No account with email ${email}. Register it on the site first.`);
  if (revoke) {
    await db.user.update({ where: { id: user.id }, data: { role: "user" } });
    console.log(`Removed super admin from ${user.email}.`);
    return;
  }
  if (!user.emailVerified) throw new Error(`${user.email} has not confirmed their email yet.`);
  if (user.banned) throw new Error(`${user.email} is suspended. Restore the account first.`);
  await db.user.update({ where: { id: user.id }, data: { role: "superadmin" } });
  console.log(`${user.email} is now a super admin. Sign in at /doraadmin/login.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
