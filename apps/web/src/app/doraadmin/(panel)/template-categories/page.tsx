import Link from "next/link";
import { CategoryManager } from "@/components/admin/category-manager";
import { CATEGORY_KINDS } from "@/lib/category-data";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Template categories" };

export default async function TemplateCategoriesPage({ searchParams }: PageProps<"/doraadmin/template-categories">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const kind = sp.kind === "model" ? "model" : "use";
  const rows = await db.templateCategory.findMany({
    where: { kind },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, kind: true, name: true, slug: true, sortOrder: true, active: true, _count: { select: { templates: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Template categories</h1>
        <p className="text-sm text-muted-foreground">
          Groups used to browse templates. A template can be in several categories. &quot;All&quot; is not stored: it simply means no filter.
        </p>
      </div>
      <nav aria-label="Category groups" className="flex gap-1 border-b">
        {CATEGORY_KINDS.map((k) => (
          <Link
            key={k.kind}
            href={`/doraadmin/template-categories?kind=${k.kind}`}
            aria-current={kind === k.kind ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${kind === k.kind ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {k.label}
          </Link>
        ))}
      </nav>
      <CategoryManager
        key={kind}
        kind={kind}
        rows={rows.map((r) => ({ id: r.id, kind: r.kind as "use" | "model", name: r.name, slug: r.slug, sortOrder: r.sortOrder, active: r.active, templateCount: r._count.templates }))}
      />
    </div>
  );
}
