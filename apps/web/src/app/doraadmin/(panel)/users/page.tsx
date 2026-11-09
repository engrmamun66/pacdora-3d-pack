import Link from "next/link";
import { BanButton } from "@/components/admin/ban-button";
import { db } from "@/server/db";
import { SUPERADMIN, requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Users" };

const PAGE_SIZE = 25;
const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function AdminUsers({ searchParams }: PageProps<"/doraadmin/users">) {
  const admin = await requireSuperAdmin();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : "1")) || 1));
  const where = q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {};

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        role: true,
        banned: true,
        banReason: true,
        createdAt: true,
        _count: { select: { projects: true, assets: true } },
        sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      },
    }),
    db.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/doraadmin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">{total} {total === 1 ? "user" : "users"}{q ? ` matching "${q}"` : ""}. Times are UTC.</p>
        </div>
        <form className="flex gap-2" role="search">
          <label className="sr-only" htmlFor="q">Search by name or email</label>
          <input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Search name or email" className="h-9 w-64 rounded-lg border border-input bg-background px-2.5 text-sm" />
          <button type="submit" className="h-9 rounded-lg border px-3 text-sm hover:bg-muted">Search</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">User</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Projects</th>
              <th scope="col" className="px-3 py-2 font-medium">Images</th>
              <th scope="col" className="px-3 py-2 font-medium">Joined</th>
              <th scope="col" className="px-3 py-2 font-medium">Last active</th>
              <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1 text-xs">
                    {u.role === SUPERADMIN ? <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">Super admin</span> : null}
                    {u.banned ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive" title={u.banReason ?? undefined}>Suspended</span> : null}
                    <span className={`rounded-full px-2 py-0.5 ${u.emailVerified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{u.emailVerified ? "Verified" : "Unverified"}</span>
                  </div>
                  {u.banned && u.banReason ? <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground">{u.banReason}</p> : null}
                </td>
                <td className="px-3 py-2 tabular-nums">{u._count.projects}</td>
                <td className="px-3 py-2 tabular-nums">{u._count.assets}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{date(u.createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{u.sessions[0] ? date(u.sessions[0].updatedAt) : "never"}</td>
                <td className="px-3 py-2 text-right">
                  {u.role === SUPERADMIN || u.id === admin.id ? null : <BanButton userId={u.id} email={u.email} banned={u.banned} />}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No users found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link className="rounded-lg border px-3 py-1.5 hover:bg-muted" href={link(page - 1)}>Previous</Link> : <span />}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages ? <Link className="rounded-lg border px-3 py-1.5 hover:bg-muted" href={link(page + 1)}>Next</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
