"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, CopyPlus, Download, ExternalLink, Menu, Pencil, Save, Share2 } from "lucide-react";
import { deleteProject } from "@/app/(app)/projects/actions";
import { authClient } from "@/lib/auth-client";
import { notify } from "@/lib/notify";
import { site } from "@/config/site";
import { UserMenuClient } from "@/components/app/user-menu-client";
import type { SaveAsOptions } from "@/server/projects";

type SaveAs = (name: string, organize?: { categoryId: string | null; tagIds: string[] }) => Promise<{ ok: boolean; message: string | null }>;

const row = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm";
const rowLive = `${row} hover:bg-muted focus-visible:bg-muted focus-visible:outline-none`;
const rowOff = `${row} cursor-not-allowed text-muted-foreground/70`;

/** Dropdown opened by the hamburger button. Closes on outside click, Escape and when a choice is made. */
function MainMenu({
  name,
  onName,
  projectId,
  canSave,
  saveHint,
  saving,
  onSaveAs,
}: {
  name: string;
  onName: (v: string) => void;
  projectId: string | null;
  canSave: boolean;
  /** Why saving is switched off (not signed in); shown as a tooltip. */
  saveHint: string | undefined;
  saving: boolean;
  onSaveAs: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const soon = (label: string) => (
    <button key={label} type="button" role="menuitem" aria-disabled className={rowOff} onClick={(e) => e.preventDefault()}>
      {label}
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">Soon</span>
    </button>
  );
  const rule = <div role="separator" className="my-1 h-px bg-border" />;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`grid size-10 place-items-center rounded-full transition-colors hover:bg-muted ${open ? "bg-muted" : ""}`}
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {open ? (
        <div role="menu" aria-label="Main menu" className="absolute left-0 top-12 z-50 w-72 rounded-2xl border bg-popover p-2 text-popover-foreground shadow-xl ring-1 ring-foreground/5">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2">
            <input
              ref={nameInput}
              aria-label="Project name"
              value={name}
              maxLength={120}
              onChange={(e) => onName(e.target.value)}
              className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none focus-visible:underline"
            />
            <button type="button" aria-label="Rename" onClick={() => nameInput.current?.focus()} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </div>
          {rule}
          <button type="submit" form="project-form" role="menuitem" disabled={saving || !canSave} title={saveHint} className={`${rowLive} disabled:cursor-not-allowed disabled:opacity-60`} onClick={() => requestAnimationFrame(() => setOpen(false))}>
            {saving ? "Saving…" : "Save"}
            <Save className="size-4 text-muted-foreground" aria-hidden />
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canSave}
            title={saveHint}
            className={`${rowLive} disabled:cursor-not-allowed disabled:opacity-60`}
            onClick={() => {
              setOpen(false);
              onSaveAs();
            }}
          >
            Save as…
            <CopyPlus className="size-4 text-muted-foreground" aria-hidden />
          </button>
          {rule}
          <button type="button" role="menuitem" className={rowLive} onClick={() => go("/templates")}>Create new project</button>
          {rule}
          {soon("Add to favorites")}
          {soon("Move")}
          {rule}
          <button type="button" role="menuitem" className={rowLive} onClick={() => go("/projects")}>My projects</button>
          {soon("AI generations")}
          <button type="button" role="menuitem" className={rowLive} onClick={() => go("/my-dashboard?tab=profile")}>Profile settings</button>
          <button type="button" role="menuitem" className={rowLive} onClick={() => go("/")}>Homepage</button>
          {rule}
          <button type="button" role="menuitem" aria-disabled className={rowOff} onClick={(e) => e.preventDefault()}>
            English
            <ChevronRight className="size-4" aria-hidden />
          </button>
          {projectId ? (
            <>
              {rule}
              <form
                action={deleteProject}
                onSubmit={(e) => {
                  if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="projectId" value={projectId} />
                <button type="submit" role="menuitem" className={`${rowLive} text-destructive`}>Delete project</button>
              </form>
            </>
          ) : null}
          {rule}
          <button
            type="button"
            role="menuitem"
            className={`${rowLive} font-medium text-red-600 dark:text-red-400`}
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Save as": asks for a name and keeps the current values as a new project (the open one stays as it is).
 * Slides down from the top like the other popups; Enter saves, Esc or Cancel closes. The form is only
 * mounted while the dialog is open, so it starts with the suggested name each time.
 */
function SaveAsDialog({ dlg, open, onOpenChange, name, options, onSaveAs }: { dlg: React.RefObject<HTMLDialogElement | null>; open: boolean; onOpenChange: (open: boolean) => void; name: string; options: SaveAsOptions | null; onSaveAs: SaveAs }) {
  return (
    <dialog
      ref={dlg}
      aria-labelledby="save-as-title"
      className="drop-dialog w-[min(28rem,calc(100vw-24px))] rounded-b-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      onClose={() => onOpenChange(false)}
    >
      {open ? <SaveAsForm name={name} options={options} onSaveAs={onSaveAs} onDone={() => dlg.current?.close()} /> : null}
    </dialog>
  );
}

function SaveAsForm({ name, options, onSaveAs, onDone }: { name: string; options: SaveAsOptions | null; onSaveAs: SaveAs; onDone: () => void }) {
  const [text, setText] = useState(name);
  // The customer's own category and tags: a group with nothing to choose from is not shown at all.
  const categories = options?.categories ?? [];
  const tags = options?.tags ?? [];
  const [categoryId, setCategoryId] = useState<string>(options?.categoryId ?? "");
  const [tagIds, setTagIds] = useState<string[]>(options?.tagIds ?? []);
  const toggleTag = (id: string) => setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ghost = "inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
  const primary = "inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-70";
  return (
    <form
      className="flex flex-col gap-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return setError("Give the new project a name.");
        setBusy(true);
        setError(null);
        const r = await onSaveAs(value, categories.length > 0 || tags.length > 0 ? { categoryId: categoryId || null, tagIds } : undefined).catch(() => ({ ok: false, message: "Could not save. Please try again." }));
        setBusy(false);
        if (r.ok) onDone();
        else setError(r.message ?? "Could not save.");
      }}
    >
      <div>
        <h2 id="save-as-title" className="text-base font-semibold">Save as</h2>
        <p className="text-sm text-muted-foreground">Keeps what you see now as a new project. The project you are in stays as it was last saved.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name of the new project
        <input
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {categories.length > 0 ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      ) : null}
      {tags.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(t.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={ghost} disabled={busy} onClick={onDone}>Cancel</button>
        <button type="submit" className={primary} disabled={busy}>{busy ? "Saving…" : "Save as new project"}</button>
      </div>
    </form>
  );
}

/**
 * Top bar of the dieline page: home mark and title, the menu, a saved/unsaved cloud, then
 * Design online, Share and the main Download button.
 */
export function DielineTopBar({
  title,
  name,
  onName,
  mode,
  projectId,
  saving,
  canSave,
  downloading,
  canDownload,
  downloadLabel,
  onDownload,
  onSaveAs,
  saveOptions = null,
  viewer = null,
}: {
  title: string;
  name: string;
  onName: (v: string) => void;
  mode: "create" | "edit";
  projectId: string | null;
  saving: boolean;
  canSave: boolean;
  downloading: boolean;
  canDownload: boolean;
  downloadLabel: string;
  onDownload: () => void;
  /** Keep the current values as a new project with this name (and the category / tags picked); resolves with how it went (the page opens the new project). */
  onSaveAs: SaveAs;
  /** The visitor's own categories and tags to choose from in "Save as". */
  saveOptions?: SaveAsOptions | null;
  /** Signed-in visitor: shown as a profile icon with an account menu. */
  viewer?: { name: string; email: string; image: string | null } | null;
}) {
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify.success("Link copied", { description: "Anyone with an account can open this template." });
    } catch {
      notify.error("Could not copy the link", { description: window.location.href });
    }
  };
  const ghost = "inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
  const primary = "inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-70";
  const saveAsDialog = useRef<HTMLDialogElement>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const openSaveAs = () => {
    setSaveAsOpen(true);
    saveAsDialog.current?.showModal();
  };
  // Saving needs an account: a visitor who is not signed in sees the buttons switched off.
  const signedIn = Boolean(viewer);
  const mayHere = canSave && signedIn;
  const whyNot = signedIn ? undefined : "Log in to save";
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
      <Link href="/" aria-label={`${site.name} home`} className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
      </Link>
      <h1 className="mr-1 hidden min-w-0 max-w-[16rem] truncate text-base font-semibold sm:block" title={title}>{title}</h1>
      <MainMenu name={name} onName={onName} projectId={projectId} canSave={mayHere} saveHint={whyNot} saving={saving} onSaveAs={openSaveAs} />

      <div className="ml-auto flex items-center gap-2">
        <button type="submit" form="project-form" disabled={saving || !mayHere} className={`${ghost} hidden sm:inline-flex`} title={whyNot ?? (mode === "edit" ? "Save the changes to this project" : "Save this as a project in My projects")}>
          <Save className="size-4" aria-hidden /> {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={!mayHere} onClick={openSaveAs} className={`${ghost} hidden md:inline-flex`} title={whyNot ?? "Save what you see as a new project with another name"}>
          <CopyPlus className="size-4" aria-hidden /> Save as
        </button>
        {mode === "edit" && projectId ? (
          <Link href={`/editor/${projectId}`} className={ghost}>
            Design Online <ExternalLink className="size-4" aria-hidden />
          </Link>
        ) : (
          <button type="submit" form="project-form" name="next" value="editor" disabled={saving || !canSave} className={ghost} title="Create a project and open the artwork editor">
            {saving ? "Creating…" : "Design Online"} <ExternalLink className="size-4" aria-hidden />
          </button>
        )}
        {mode === "create" ? (
          <button type="button" aria-label="Copy link" title="Copy link" onClick={() => void share()} className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Share2 className="size-5" aria-hidden />
          </button>
        ) : null}
        <button type="button" disabled={!canDownload || downloading} onClick={onDownload} className={primary}>
          <Download className="size-4" aria-hidden /> {downloading ? "Preparing…" : downloadLabel}
        </button>
        {viewer ? <UserMenuClient name={viewer.name} email={viewer.email} image={viewer.image} /> : null}
      </div>
      <SaveAsDialog dlg={saveAsDialog} open={saveAsOpen} onOpenChange={setSaveAsOpen} name={defaultCopyName(name, mode)} options={saveOptions} onSaveAs={onSaveAs} />
    </header>
  );
}

/** The name offered by "Save as": "<name> copy" for a saved project, the project's own name before the first save. */
function defaultCopyName(name: string, mode: "create" | "edit"): string {
  const base = name.trim();
  return mode === "edit" && base ? `${base} copy`.slice(0, 120) : base;
}
