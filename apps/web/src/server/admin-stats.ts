import "server-only";
import { db } from "./db";

const DAY = 86_400_000;

export interface OverviewStats {
  users: { total: number; verified: number; banned: number; new7: number; new30: number; active7: number };
  projects: { total: number; new7: number };
  assets: { total: number; bytes: number };
  /** Exports and uploads come from rate-limit events, which are kept for 24 hours only. */
  last24h: { exports: number; uploads: number };
  aiRequests7: number;
  aiOutcomes: { outcome: string; count: number }[];
  signups14: { day: string; count: number }[];
}

/** All overview numbers in one round of parallel queries. Counts only; no personal data. */
export async function overviewStats(now = new Date()): Promise<OverviewStats> {
  const d7 = new Date(now.getTime() - 7 * DAY);
  const d1 = new Date(now.getTime() - DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  // 14 UTC days including today.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13));

  const [total, verified, banned, new7, new30, active7, projects, projects7, assets, exports, uploads, ai7, outcomes, signups] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { emailVerified: true } }),
    db.user.count({ where: { banned: true } }),
    db.user.count({ where: { createdAt: { gte: d7 } } }),
    db.user.count({ where: { createdAt: { gte: d30 } } }),
    db.session.findMany({ where: { updatedAt: { gte: d7 } }, distinct: ["userId"], select: { userId: true } }).then((r) => r.length),
    db.project.count(),
    db.project.count({ where: { createdAt: { gte: d7 } } }),
    db.asset.aggregate({ _count: true, _sum: { sizeBytes: true } }),
    db.rateEvent.count({ where: { kind: "export", createdAt: { gte: d1 } } }),
    db.rateEvent.count({ where: { kind: "upload", createdAt: { gte: d1 } } }),
    db.aiRequest.count({ where: { createdAt: { gte: d7 } } }),
    db.aiRequest.groupBy({ by: ["outcome"], where: { createdAt: { gte: d7 } }, _count: true }),
    db.$queryRaw<{ d: Date; c: number }[]>`select date_trunc('day', "createdAt") as d, count(*)::int as c from "user" where "createdAt" >= ${start} group by 1`,
  ]);

  const byDay = new Map(signups.map((r) => [new Date(r.d).toISOString().slice(0, 10), r.c]));
  const signups14 = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });

  return {
    users: { total, verified, banned, new7, new30, active7 },
    projects: { total: projects, new7: projects7 },
    assets: { total: assets._count, bytes: assets._sum.sizeBytes ?? 0 },
    last24h: { exports, uploads },
    aiRequests7: ai7,
    aiOutcomes: outcomes.map((o) => ({ outcome: o.outcome, count: o._count })),
    signups14,
  };
}
