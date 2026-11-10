"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Cloud, CloudCheck, Download, ExternalLink, Menu, Pencil, Share2 } from "lucide-react";
import { deleteProject } from "@/app/(app)/projects/actions";
import { authClient } from "@/lib/auth-client";
import { notify } from "@/lib/notify";
import { site } from "@/config/site";

const row = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm";
const rowLive = `${row} hover:bg-muted focus-visible:bg-muted focus-visible:outline-none`;
const rowOff = `${row} cursor-not-allowed text-muted-foreground/70`;

/** Dropdown opened by the hamburger button. Closes on outside click, Escape and when a choice is made. */
function MainMenu({
  name,
  onName,
  projectId,
}: {
  name: string;
  onName: (v: string) => void;
  projectId: string | null;
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
          <button type="button" role="menuitem" className={rowLive} onClick={() => go("/templates")}>Create new project</button>
          {rule}
          {soon("Add to favorites")}
          {soon("Move")}
          {soon("Make a copy")}
          {rule}
          <button type="button" role="menuitem" className={rowLive} onClick={() => go("/projects")}>My projects</button>
          {soon("AI generations")}
          <button type="button" role="menuitem" className={rowLive} onClick={() => go("/settings")}>Account</button>
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
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
      <Link href="/" aria-label={`${site.name} home`} className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
      </Link>
      <h1 className="mr-1 hidden min-w-0 max-w-[16rem] truncate text-base font-semibold sm:block" title={title}>{title}</h1>
      <MainMenu name={name} onName={onName} projectId={projectId} />
      <span
        role="img"
        aria-label={mode === "edit" ? "Project saved" : "Not saved yet"}
        title={mode === "edit" ? "Project saved" : "Not saved yet: create a project to keep your settings"}
        className="grid size-10 place-items-center text-muted-foreground"
      >
        {mode === "edit" ? <CloudCheck className="size-5" /> : <Cloud className="size-5" />}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {mode === "edit" ? (
          <button type="submit" form="project-form" disabled={saving || !canSave} className={`${ghost} hidden sm:inline-flex`}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        ) : null}
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
      </div>
    </header>
  );
}
