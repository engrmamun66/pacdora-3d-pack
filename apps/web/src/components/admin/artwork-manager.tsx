"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Pencil, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteArtwork, updateArtwork } from "@/app/doraadmin/artwork-actions";
import { MAX_CATEGORY, MAX_NAME, numberedNames, parseTags } from "@/lib/artwork-meta";
import { MAX_UPLOAD_BYTES } from "@/lib/image-sniff";
import { notify } from "@/lib/notify";

export interface ArtworkRow {
  id: string;
  name: string;
  tags: string[];
  category: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
}

const input = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const iconBtn = "grid size-8 place-items-center rounded-md border hover:bg-muted";
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const checker = "bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-size-[16px_16px]";

interface Staged {
  key: number;
  file: File;
  url: string;
  /** Own name / tags typed for this picture; null = use the shared form. */
  name: string | null;
  tags: string | null;
  error?: string;
}

/**
 * Add pictures: drop them on the area or choose them (one or many).
 * One shared form (name, tags, category) covers the whole batch; several pictures are numbered
 * after the name ("Star 1", "Star 2" ...). "Each separately" lets a picture have its own name and tags.
 */
export function ArtworkUploadForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const listId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const urls = useRef(new Set<string>());
  const [items, setItems] = useState<Staged[]>([]);
  const [over, setOver] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("");
  const [separate, setSeparate] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const release = (url: string) => {
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  };

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const fresh: Staged[] = [];
    let skipped = 0;
    for (const f of Array.from(list)) {
      if (!/^image\/(png|jpeg)$/.test(f.type) || f.size > MAX_UPLOAD_BYTES) {
        skipped++;
        continue;
      }
      const url = URL.createObjectURL(f);
      urls.current.add(url);
      fresh.push({ key: ++counter.current, file: f, url, name: null, tags: null });
    }
    if (skipped) notify.error(`${skipped} file${skipped > 1 ? "s were" : " was"} skipped: only PNG or JPEG up to 10 MB can be added.`);
    if (fresh.length === 0) return;
    // A single picture suggests its name from the file name, so a quick add needs only tags.
    if (!name && items.length === 0 && fresh.length === 1) setName(fresh[0]!.file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, MAX_NAME));
    setItems((cur) => [...cur, ...fresh]);
  };

  const remove = (key: number) =>
    setItems((cur) => {
      const gone = cur.find((i) => i.key === key);
      if (gone) release(gone.url);
      return cur.filter((i) => i.key !== key);
    });

  const clear = () => {
    items.forEach((i) => release(i.url));
    setItems([]);
    setName("");
    setTags("");
    setSeparate(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const multi = items.length > 1;
  const names = numberedNames(name, items.length);
  const finalName = (i: number) => items[i]!.name ?? names[i]!;
  const finalTags = (i: number) => items[i]!.tags ?? tags;
  const patch = (key: number, p: Partial<Staged>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const submit = async () => {
    for (let i = 0; i < items.length; i++) {
      if (finalName(i).trim().length < 2) return notify.error(multi ? `Picture ${i + 1}: name must be at least 2 characters.` : "Name must be at least 2 characters.");
      if (parseTags(finalTags(i)).length === 0) return notify.error(multi ? `Picture ${i + 1}: add at least one tag.` : "Add at least one tag.");
    }
    const batch = items.map((it, i) => ({ it, name: finalName(i), tags: finalTags(i) }));
    let ok = 0;
    setProgress({ done: 0, total: batch.length });
    for (const b of batch) {
      try {
        const body = new FormData();
        body.set("file", b.it.file);
        body.set("name", b.name);
        body.set("tags", b.tags);
        body.set("category", category);
        const res = await fetch("/api/doraadmin/artworks", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.ok) {
          ok++;
          setItems((cur) => cur.filter((i) => i.key !== b.it.key));
          release(b.it.url);
        } else patch(b.it.key, { error: json.error ?? "Could not add this picture." });
      } catch {
        patch(b.it.key, { error: "Could not add this picture. Please try again." });
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    const failed = batch.length - ok;
    if (ok) {
      notify.success(ok === 1 ? `Artwork "${batch[0]!.name}" added.` : `${ok} artworks added.`);
      router.refresh();
    }
    if (failed) notify.error(`${failed} picture${failed > 1 ? "s" : ""} could not be added. See the message on each one.`);
    else clear();
  };

  const busy = progress !== null;

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && items.length) void submit();
      }}
    >
      <label
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/60 ${items.length ? "px-4 py-3" : "px-4 py-10"} ${over ? "border-primary bg-primary/5 text-foreground" : "bg-muted/30"}`}
      >
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" multiple className="sr-only" aria-label="Picture files" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <ImagePlus className={items.length ? "size-5" : "size-8"} aria-hidden />
        <span className="font-medium text-foreground">{over ? "Drop to add" : items.length ? "Drop or choose more pictures" : "Drop pictures here, or click to choose"}</span>
        {items.length === 0 ? <span className="text-xs">PNG or JPEG, up to 10 MB each. Choose several to add them together.</span> : null}
      </label>

      {items.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_14rem]">
            <label className="flex flex-col gap-1 text-xs font-medium">
              {multi ? "Name (numbered 1, 2, 3 …)" : "Name"}
              <input className={input} value={name} maxLength={MAX_NAME} required={!separate} minLength={2} disabled={busy} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Tags (separate with commas)
              <input className={input} value={tags} required={!separate} placeholder="gold, star, holiday" disabled={busy} onChange={(e) => setTags(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium sm:col-span-2 lg:col-span-1">
              Category (optional)
              <input className={input} value={category} maxLength={MAX_CATEGORY} list={listId} placeholder="e.g. Patterns" disabled={busy} onChange={(e) => setCategory(e.target.value)} />
              <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          </div>
          {multi ? (
            <label className="flex w-fit items-center gap-2 text-sm">
              <input type="checkbox" checked={separate} disabled={busy} onChange={(e) => setSeparate(e.target.checked)} />
              Name and tag each picture separately
            </label>
          ) : null}

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3" aria-label="Pictures to add">
            {items.map((it, i) => (
              <li key={it.key} className={`flex flex-col overflow-hidden rounded-lg border ${it.error ? "border-destructive" : ""}`}>
                <div className={`relative grid h-24 place-items-center ${checker}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img src={it.url} alt="" className="max-h-full max-w-full object-contain" />
                  {!busy ? (
                    <button type="button" aria-label={`Remove ${it.file.name}`} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-background/90 shadow hover:bg-background" onClick={() => remove(it.key)}><X className="size-3.5" /></button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 p-2">
                  {separate ? (
                    <>
                      <input aria-label={`Name of picture ${i + 1}`} className={`${input} h-8 text-xs`} value={finalName(i)} maxLength={MAX_NAME} disabled={busy} onChange={(e) => patch(it.key, { name: e.target.value })} />
                      <input aria-label={`Tags of picture ${i + 1}`} className={`${input} h-8 text-xs`} value={finalTags(i)} placeholder="tags" disabled={busy} onChange={(e) => patch(it.key, { tags: e.target.value })} />
                    </>
                  ) : (
                    <p className="truncate text-xs font-medium" title={finalName(i)}>{finalName(i) || "No name yet"}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{it.file.name} · {kb(it.file.size)}</p>
                  {it.error ? <p role="alert" className="text-xs text-destructive">{it.error}</p> : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="h-9" disabled={busy}>
              <Upload className="size-4" aria-hidden />
              {busy ? `Adding ${progress!.done + 1} of ${progress!.total}…` : items.length === 1 ? "Add artwork" : `Add ${items.length} artworks`}
            </Button>
            <Button type="button" variant="outline" className="h-9" disabled={busy} onClick={clear}>Clear</Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

/** Small picture for the list view. */
function Thumb({ id }: { id: string }) {
  return (
    <div className={`grid size-10 place-items-center rounded ${checker}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private route, cached by URL */}
      <img src={`/api/artworks/${id}/image`} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

/** The library, as a gallery (default) or a list. Edit name, tags and category in place, or delete. */
export function ArtworkGrid({ rows, categories, filtered, view }: { rows: ArtworkRow[]; categories: string[]; filtered: boolean; view: "gallery" | "list" }) {
  const router = useRouter();
  const listId = useId();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", tags: "", category: "" });

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          notify.success(r.message);
          after?.();
          router.refresh();
        } else notify.error(r.message);
      } catch {
        notify.error("Could not complete the action. Please try again.");
      }
    });

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{filtered ? "No artwork matches." : "No artworks yet. Drop the first pictures above."}</p>;
  }

  const startEdit = (r: ArtworkRow) => {
    setEditing(r.id);
    setDraft({ name: r.name, tags: r.tags.join(", "), category: r.category });
  };
  const save = (r: ArtworkRow) => run(() => updateArtwork({ id: r.id, ...draft }), () => setEditing(null));
  const del = (r: ArtworkRow) => {
    if (window.confirm(`Delete "${r.name}"? The picture file is removed too.`)) run(() => deleteArtwork(r.id));
  };
  const fields = (
    <>
      <input aria-label="Name" className={input} value={draft.name} maxLength={MAX_NAME} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <input aria-label="Tags" className={input} value={draft.tags} placeholder="tags, separated by commas" onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
      <input aria-label="Category" className={input} value={draft.category} list={listId} maxLength={MAX_CATEGORY} placeholder="Category (optional)" onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
    </>
  );
  const editButtons = (r: ArtworkRow) => (
    <div className="flex justify-end gap-1">
      <button type="button" aria-label="Save" disabled={pending} className={iconBtn} onClick={() => save(r)}><Check className="size-4" /></button>
      <button type="button" aria-label="Cancel" className={iconBtn} onClick={() => setEditing(null)}><X className="size-4" /></button>
    </div>
  );
  const actions = (r: ArtworkRow) => (
    <div className="flex justify-end gap-1">
      <button type="button" aria-label={`Edit ${r.name}`} className={iconBtn} onClick={() => startEdit(r)}><Pencil className="size-4" /></button>
      <button type="button" aria-label={`Delete ${r.name}`} disabled={pending} className={`${iconBtn} border-destructive/40 text-destructive hover:bg-destructive/10`} onClick={() => del(r)}><Trash2 className="size-4" /></button>
    </div>
  );
  const tagChips = (r: ArtworkRow) => (
    <ul className="flex flex-wrap gap-1" aria-label="Tags">
      {r.tags.map((t) => <li key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t}</li>)}
    </ul>
  );

  return (
    <>
      <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
      {view === "gallery" ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
              <div className={`grid h-40 place-items-center ${checker}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private route, cached by URL */}
                <img src={`/api/artworks/${r.id}/image`} alt={r.name} loading="lazy" className="max-h-full max-w-full object-contain" />
              </div>
              {editing === r.id ? (
                <div className="flex flex-col gap-2 border-t p-3">{fields}{editButtons(r)}</div>
              ) : (
                <div className="flex flex-1 flex-col gap-2 border-t p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={r.name}>{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.category || "No category"} · {r.widthPx}×{r.heightPx} px · {kb(r.sizeBytes)}</p>
                  </div>
                  {tagChips(r)}
                  <div className="mt-auto pt-1">{actions(r)}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-16 px-3 py-2 font-medium"><span className="sr-only">Picture</span></th>
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Category</th>
                <th scope="col" className="px-3 py-2 font-medium">Tags</th>
                <th scope="col" className="px-3 py-2 font-medium">Size</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                editing === r.id ? (
                  <tr key={r.id} className="border-b bg-muted/20 last:border-0">
                    <td className="px-3 py-2"><Thumb id={r.id} /></td>
                    <td className="px-3 py-2"><input aria-label="Name" className={`${input} w-48`} value={draft.name} maxLength={MAX_NAME} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                    <td className="px-3 py-2"><input aria-label="Category" className={`${input} w-40`} value={draft.category} list={listId} maxLength={MAX_CATEGORY} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></td>
                    <td className="px-3 py-2"><input aria-label="Tags" className={`${input} w-56`} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.widthPx}×{r.heightPx}</td>
                    <td className="px-3 py-2">{editButtons(r)}</td>
                  </tr>
                ) : (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2"><Thumb id={r.id} /></td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.category || "—"}</td>
                    <td className="px-3 py-2">{tagChips(r)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{r.widthPx}×{r.heightPx} px · {kb(r.sizeBytes)}</td>
                    <td className="px-3 py-2">{actions(r)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
