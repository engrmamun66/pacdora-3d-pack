"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { cloneTemplate, deleteTemplate, setTemplateStatus } from "@/app/doraadmin/template-actions";
import { notify } from "@/lib/notify";
import { TEMPLATE_STATUSES, type TemplateStatus } from "@/lib/template-status";
import { ViewSettingsButton } from "@/components/templates-admin/view-settings-dialog";

export function TemplateRowActions({ slug, name, source, status, has3d }: { slug: string; name: string; source: string; status: TemplateStatus; has3d: boolean }) {
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
      {source === "svg" ? (
        <button
          type="button"
          disabled={pending}
          aria-label={`Copy ${name}`}
          title="Copy this template (the copy starts as a Draft)"
          className={btn}
          onClick={() =>
            start(async () => {
              try {
                const r = await cloneTemplate(slug);
                if (r.ok && r.slug) {
                  notify.success(r.message);
                  router.push(`/doraadmin/templates/${r.slug}/edit`);
                } else notify.error(r.message);
              } catch {
                notify.error("Could not copy the template. Please try again.");
              }
            })
          }
        >
          <Copy className="size-4" />
        </button>
      ) : null}
      <select
        aria-label={`Status of ${name}`}
        disabled={pending}
        value={status}
        className="h-8 rounded-md border bg-background px-1.5 text-xs disabled:opacity-50"
        onChange={(e) => run(() => setTemplateStatus(slug, e.target.value))}
      >
        {TEMPLATE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
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
