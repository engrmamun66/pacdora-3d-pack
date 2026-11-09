"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { deleteTemplate, setTemplatePublished } from "@/app/doraadmin/template-actions";
import { notify } from "@/lib/notify";
import { ViewSettingsButton } from "@/components/templates-admin/view-settings-dialog";

export function TemplateRowActions({ slug, name, source, published, has3d }: { slug: string; name: string; source: string; published: boolean; has3d: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          notify.success(r.message);
          router.refresh();
        } else notify.error(r.message);
      } catch {
        notify.error("Could not complete the action. Please try again.");
      }
    });
  const btn = "grid size-8 place-items-center rounded-md border hover:bg-muted disabled:opacity-50";
  return (
    <div className="flex justify-end gap-1">
      <a href={`/template/dieline/${slug}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${name} (new tab)`} className={btn}><ExternalLink className="size-4" /></a>
      {has3d ? <ViewSettingsButton slug={slug} name={name} className={btn} /> : null}
      <Link href={`/doraadmin/templates/${slug}/edit`} aria-label={`Edit ${name}`} className={btn}><Pencil className="size-4" /></Link>
      <button type="button" disabled={pending} aria-label={published ? `Hide ${name}` : `Publish ${name}`} className={btn} onClick={() => run(() => setTemplatePublished(slug, !published))}>
        {published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      {source === "svg" ? (
        <button
          type="button"
          disabled={pending}
          aria-label={`Delete ${name}`}
          className="grid size-8 place-items-center rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          onClick={() => {
            if (window.confirm(`Delete "${name}"? This cannot be undone.`)) run(() => deleteTemplate(slug));
          }}
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
