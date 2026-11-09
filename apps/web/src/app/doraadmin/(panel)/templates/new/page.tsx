import Link from "next/link";
import { TemplateWizard } from "@/components/templates-admin/template-wizard";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Add template" };

export default async function NewTemplatePage() {
  await requireSuperAdmin();
  const categories = await db.templateCategory.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, kind: true, name: true } });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/doraadmin/templates" className="text-sm text-muted-foreground hover:underline">← Templates</Link>
        <h1 className="text-2xl font-semibold">Add template</h1>
      </div>
      <TemplateWizard
        mode="create"
        categories={categories.map((c) => ({ id: c.id, kind: c.kind as "use" | "model", name: c.name }))}
        initial={{ slug: "", name: "", description: "", published: false, categoryIds: [], source: null, dieline: null, roles: {}, options: { unit: "auto", scale: 1, pxPerInch: 96 } }}
      />
    </div>
  );
}
