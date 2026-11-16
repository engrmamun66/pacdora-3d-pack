import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

// Reuse one client across hot reloads in development. It is remembered together with the class that made
// it: after `prisma generate` (new model) the class is a new one, so the old client is dropped
// instead of being reused without the new tables.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaClass?: typeof PrismaClient };

if (globalForPrisma.prisma && globalForPrisma.prismaClass !== PrismaClient) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const db =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaClass = PrismaClient;
}
