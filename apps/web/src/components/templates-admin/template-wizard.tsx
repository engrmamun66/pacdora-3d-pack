"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileUp, ImagePlus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { validateFoldSetup, type FoldSetup } from "@packaging/dieline-engine";
import { SvgImportError, importSvg, suggestRoles, toFlatDieline, type ImportedDieline, type Role } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { saveTemplate } from "@/app/doraadmin/template-actions";
import { notify } from "@/lib/notify";
import { isValidSlug, slugify } from "@/lib/slug";
import { MAX_SVG_CHARS, ROLE_COLOR, ROLE_HINTS, ROLE_LABELS, ROLE_ORDER } from "@/lib/template-import";
import { DefaultMaterialField } from "./default-material-field";
import { ImportedPreview } from "./imported-preview";
import { RoleSampleButton } from "./role-sample";
import { SvgPreviewButton } from "./svg-preview";
import { FoldSetupEditor } from "./fold-setup-editor";
import { ViewSettingsInline } from "./view-settings-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { linesKey } from "@/lib/fold-edit";
import { colorRoles, type SvgColorSettings } from "@/lib/svg-colors";

type Unit = "auto" | "mm" | "cm" | "in" | "pt" | "px";
interface Options {
  unit: Unit;
  scale: number;
  pxPerInch: number;
}

export interface WizardInitial {
  slug: string;
  name: string;
  description: string;
  published: boolean;
  sortOrder: number;
  /** URL of the current box background picture, or null. */
  backgroundUrl: string | null;
  categoryIds: string[];
  source: "builtin" | "svg" | null;
  dieline: ImportedDieline | null;
  roles: Record<string, Role>;
  options: Options;
  /** How the template folds in 3D (imported templates), or null for flat only. */
  fold: FoldSetup | null;
  /** Ignored line styles kept as an optional "Reference" picture for customers. */
  referenceStyles: string[];
  /** Built-in templates with a board thickness: the generator's limits (mm) and the saved default (null = the template's own). */
  material: { min: number; max: number; value: number | null } | null;
}

export interface WizardCategory {
  id: string;
  kind: "use" | "model";
  name: string;
}

type Parsed = { ok: true; dieline: ImportedDieline } | { ok: false; error: string };

function tryImport(text: string, o: Options): Parsed {
  try {
    return { ok: true, dieline: importSvg(text, { unit: o.unit, scale: o.scale, pxPerInch: o.pxPerInch }) };
  } catch (e) {
    return { ok: false, error: e instanceof SvgImportError ? e.message : "This file could not be read as an SVG." };
  }
}

const field = "h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const mmToIn = (mm: number) => (mm / 25.4).toFixed(2);

/**
 * Add or edit a template in steps: categories, SVG file, customise, details.
 * Built-in (parametric) templates only have categories and details to edit.
 */
export function TemplateWizard({ mode, categories, initial, svgColors }: { mode: "create" | "edit"; categories: WizardCategory[]; initial: WizardInitial; svgColors: SvgColorSettings }) {
  const router = useRouter();
  const builtin = initial.source === "builtin";
  const steps = builtin ? ["Categories", "Details"] : ["Categories", "SVG file", "Customize", "3D fold", "Details & publish"];

  const [step, setStep] = useState(0);
  const [categoryIds, setCategoryIds] = useState<string[]>(initial.categoryIds);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [opts, setOpts] = useState<Options>(initial.options);
  // Only three units are offered. A template saved earlier with another choice (auto, cm, pt) shows as pixels, the old fallback.
  const shownUnit: "mm" | "in" | "px" = opts.unit === "mm" || opts.unit === "in" ? opts.unit : "px";
  const [overrides, setOverrides] = useState<Record<string, Role>>(initial.roles);
  const [showBleed, setShowBleed] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [replay, setReplay] = useState(0);
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(initial.description);
  const [published, setPublished] = useState(initial.published);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);
  const [defaultThickness, setDefaultThickness] = useState<number | null>(initial.material?.value ?? null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  // Preview of a newly chosen picture; revoked when replaced or on unmount.
  const bgPreview = useMemo(() => (bgFile ? URL.createObjectURL(bgFile) : null), [bgFile]);
  useEffect(() => () => { if (bgPreview) URL.revokeObjectURL(bgPreview); }, [bgPreview]);
  const bgShown = bgPreview ?? (bgRemoved ? null : initial.backgroundUrl);

  const parsed = useMemo<Parsed | null>(() => (text ? tryImport(text, opts) : null), [text, opts]);
  const dieline: ImportedDieline | null = parsed?.ok ? parsed.dieline : parsed ? null : initial.dieline;
  // The importer's guess, with the admin's colour rules (Settings > SVG Dieline Color) on top.
  const suggested = useMemo(() => (dieline ? { ...suggestRoles(dieline.styles), ...colorRoles(dieline.styles, svgColors) } : {}), [dieline, svgColors]);
  const roles = useMemo(() => {
    const r: Record<string, Role> = {};
    for (const st of dieline?.styles ?? []) r[st.key] = overrides[st.key] ?? suggested[st.key] ?? st.suggestedRole;
    return r;
  }, [dieline, overrides, suggested]);
  const previewRoles = useMemo(() => {
    const r = { ...roles };
    for (const st of dieline?.styles ?? []) {
      if (!showBleed && r[st.key] === "bleed") r[st.key] = "ignore";
      if (!showGuides && r[st.key] === "guide") r[st.key] = "ignore";
    }
    return r;
  }, [roles, dieline, showBleed, showGuides]);

  // 3D fold: the lines it was set up for are remembered, so a change to them is noticed.
  const flat = useMemo(() => (dieline ? toFlatDieline(dieline, roles) : null), [dieline, roles]);
  const flatKey = flat ? linesKey(flat) : "";
  // "Show as reference" is on by default for every ignored style: remember the ones the admin switched OFF.
  // (A template saved before this default keeps exactly what it had: its ignored styles not listed are off.)
  const [noRef, setNoRef] = useState<string[]>(() => Object.keys(initial.roles).filter((k) => initial.roles[k] === "ignore" && !initial.referenceStyles.includes(k)));
  const refStyles = useMemo(() => Object.keys(roles).filter((k) => roles[k] === "ignore" && !noRef.includes(k)), [roles, noRef]);
  const [fold, setFold] = useState<FoldSetup | null>(initial.fold);
  const [foldKey, setFoldKey] = useState(() => (initial.dieline && initial.fold ? linesKey(toFlatDieline(initial.dieline, initial.roles)) : ""));
  const foldStale = fold !== null && foldKey !== flatKey;
  const foldProblems = fold && !foldStale ? validateFoldSetup(fold) : [];
  const foldOk = !foldStale && foldProblems.length === 0;

  // Edit mode: has anything changed since the page loaded? (Compared as plain data.)
  const sortedRoles = (r: Record<string, Role>) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));
  const snapshot = JSON.stringify({
    name: name.trim(), slug, description: description.trim(), published, sortOrder,
    cats: [...categoryIds].sort(), roles: sortedRoles(roles), opts, dt: defaultThickness,
    newSvg: text !== null, bg: bgFile ? "new" : bgRemoved ? "removed" : "same", fold, refs: [...refStyles].sort(),
  });
  const [baseline] = useState(() =>
    JSON.stringify({
      name: initial.name.trim(), slug: initial.slug, description: initial.description.trim(), published: initial.published, sortOrder: initial.sortOrder,
      cats: [...initial.categoryIds].sort(), roles: sortedRoles(initial.roles), opts: initial.options, dt: initial.material?.value ?? null,
      newSvg: false, bg: "same", fold: initial.fold, refs: [...initial.referenceStyles].sort(),
    }),
  );
  const dirty = mode === "create" || snapshot !== baseline;

  const [activeSection, setActiveSection] = useState("sec-details");
  useEffect(() => {
    if (mode !== "edit") return;
    const ids = ["sec-details", "sec-categories", "sec-background", "sec-dieline", "sec-lines", "sec-fold", "sec-view"];
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    // The section crossing the upper third of the screen is the current one.
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActiveSection(hit.target.id);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [mode, builtin, dieline !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasCut = Object.values(roles).includes("cut");
  // Customers get a resizable sheet from the Cut lines, so some Cut shape must be closed.
  const hasClosedCut = !dieline || dieline.paths.some((p) => p.closed && roles[p.style] === "cut");
  const slugOk = isValidSlug(slug);
  const nameOk = name.trim().length >= 2;
  const stepName = steps[step]!;

  const canNext =
    stepName === "Categories" ? categoryIds.length > 0 :
    stepName === "SVG file" ? dieline !== null :
    stepName === "Customize" ? dieline !== null && hasCut && hasClosedCut :
    stepName === "3D fold" ? foldOk :
    true;
  const blocker =
    stepName === "Categories" && categoryIds.length === 0 ? "Choose at least one category." :
    stepName === "SVG file" && dieline === null ? "Upload an SVG file to continue." :
    stepName === "Customize" && !hasCut ? "Mark at least one line style as Cut." :
    stepName === "Customize" && !hasClosedCut ? "The Cut lines must include a closed outline." :
    stepName === "3D fold" && !foldOk ? (foldStale ? "Detect the panels again, or make the template flat only." : "Fix the problems in the 3D fold.") : null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_SVG_CHARS) return notify.error("That file is too large", { description: "SVG files up to 3 MB are accepted." });
    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") return notify.error("Please choose an .svg file");
    const t = await file.text();
    setText(t);
    setFileName(file.name);
    setOverrides({});
    setNoRef([]);
    if (!name.trim() && mode === "create") {
      const guess = file.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim();
      setName(guess);
      if (!slugTouched) setSlug(slugify(guess));
    }
  }

  function onBgFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return notify.error("That image is too large", { description: "Images up to 10 MB are accepted." });
    if (file.type !== "image/png" && file.type !== "image/jpeg") return notify.error("Please choose a PNG or JPEG image");
    setBgFile(file);
    setBgRemoved(false);
  }

  /** The picture goes up after the template is saved (it needs the final address). Returns false if it failed. */
  async function syncBackground(finalSlug: string): Promise<boolean> {
    try {
      if (bgFile) {
        const body = new FormData();
        body.set("slug", finalSlug);
        body.set("file", bgFile);
        const res = await fetch("/api/doraadmin/template-background", { method: "POST", body });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Upload failed (${res.status}).`);
      } else if (bgRemoved && initial.backgroundUrl) {
        const res = await fetch(`/api/doraadmin/template-background?slug=${encodeURIComponent(finalSlug)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not remove the background image.");
      }
      return true;
    } catch (e) {
      notify.error((e as Error).message, { description: "The template was saved. Edit it to try the background image again." });
      return false;
    }
  }

  async function save() {
    if (!nameOk || !slugOk) return;
    setSaving(true);
    try {
      const r = await saveTemplate({
        mode, slug, name, description, published, categoryIds, sortOrder,
        ...(initial.material ? { defaultThickness } : {}),
        ...(mode === "edit" ? { originalSlug: initial.slug } : {}),
        ...(text ? { svg: text } : {}),
        unit: opts.unit, scale: opts.scale, pxPerInch: opts.pxPerInch,
        roles,
        fold: foldOk ? fold : null,
        referenceStyles: refStyles,
      });
      if (r.ok) {
        const finalSlug = r.slug ?? slug;
        const bgOk = await syncBackground(finalSlug);
        if (bgOk) notify.success(r.message);
        if (mode === "create") {
          // On a failed picture upload go to the edit page of the saved template so it can be retried.
          router.push(bgOk ? "/doraadmin/templates" : `/doraadmin/templates/${finalSlug}/edit`);
        } else if (finalSlug !== initial.slug) {
          router.replace(`/doraadmin/templates/${finalSlug}/edit`); // renamed: the page address changes
        }
        router.refresh(); // edit stays here; the page remounts with the saved data
      } else notify.error(r.message);
    } catch {
      notify.error("Could not save the template. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const saveShortcut = useEffectEvent(() => {
    if (!saving && dirty && nameOk && slugOk && categoryIds.length > 0 && (builtin || (hasCut && hasClosedCut && foldOk))) void save();
  });
  useEffect(() => {
    if (mode !== "edit") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveShortcut();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [mode, dirty]);

  const toggleCategory = (id: string) => setCategoryIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  // ---- the pieces, shared by the create stepper and the edit page
  const categoriesSection = (
        <section aria-labelledby="s-cat" className="flex flex-col gap-5">
          <div>
            <h2 id="s-cat" className="text-lg font-semibold">{mode === "create" ? "Choose categories" : "Categories"}</h2>
            <p className="text-sm text-muted-foreground">A template can be in several: for example Food (by use) and Tuck End Boxes (by model). Pick at least one.</p>
          </div>
          <div className="flex flex-col divide-y">
            {(["use", "model"] as const).map((k) => {
              const group = categories.filter((c) => c.kind === k);
              const picked = group.filter((c) => categoryIds.includes(c.id)).length;
              return (
                <fieldset key={k} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
                  <legend className="float-left flex w-full items-center gap-2 text-sm font-medium">
                    {k === "use" ? "By uses" : "By models"}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${picked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {picked ? `${picked} of ${group.length} selected` : `${group.length} options`}
                    </span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {group.map((c) => {
                      const on = categoryIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 ${on ? "border-primary bg-primary text-primary-foreground shadow-xs" : "bg-background hover:border-primary/50 hover:bg-primary/5"}`}
                        >
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCategory(c.id)} />
                          {on ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
                          {c.name}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>
  );
  const svgSection = (
        <section aria-labelledby="s-svg" className="flex flex-col gap-5">
          <div>
            <h2 id="s-svg" className="text-lg font-semibold">{mode === "create" ? "Upload the dieline SVG" : "Dieline file"}</h2>
            <p className="text-sm text-muted-foreground">
              Any dieline drawn as lines and shapes (Illustrator, Inkscape, Figma, a cutting-table export). Text, images and effects are ignored. Use only files you have the right to publish.
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center"
          >
            <FileUp className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm">{fileName ? <>Loaded <strong>{fileName}</strong></> : initial.dieline && !text ? "Current geometry is kept unless you upload a new file." : "Drop an SVG here, or"}</p>
            <input ref={fileInput} type="file" accept=".svg,image/svg+xml" className="sr-only" aria-label="Choose SVG file" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>Choose file</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Units in the file
              <select className={field} value={shownUnit} onChange={(e) => setOpts({ ...opts, unit: e.target.value as Unit })}>
                <option value="mm">Millimeters</option>
                <option value="in">Inches</option>
                <option value="px">Pixels</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Scale (×)
              <input className={field} type="number" min={0.001} max={1000} step="any" value={opts.scale} onChange={(e) => setOpts({ ...opts, scale: Number(e.target.value) || 1 })} />
            </label>
            {shownUnit === "px" ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Pixels per inch
                <input className={field} type="number" min={1} max={2400} value={opts.pxPerInch} onChange={(e) => setOpts({ ...opts, pxPerInch: Number(e.target.value) || 96 })} />
              </label>
            ) : null}
          </div>

          {parsed && !parsed.ok ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{parsed.error}</p> : null}

          {dieline ? (
            <div className="rounded-xl border p-4 text-sm">
              <p className="font-medium">
                Sheet size {dieline.widthMm.toFixed(1)} × {dieline.heightMm.toFixed(1)} mm ({mmToIn(dieline.widthMm)} × {mmToIn(dieline.heightMm)} in)
              </p>
              <p className="text-muted-foreground">
                {dieline.paths.length} lines and shapes in {dieline.styles.length} {dieline.styles.length === 1 ? "style" : "styles"}.
                {text ? ` Units: ${dieline.report.unit} (${dieline.report.unitSource === "svg-size" ? "from the file" : dieline.report.unitSource === "option" ? "your choice" : "assumed"}).` : ""}
              </p>
              {text && dieline.report.warnings.length ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-800 dark:text-amber-300">
                  {dieline.report.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">Check the size against the real box. If it is wrong, change the units or scale above.</p>
            </div>
          ) : null}
        </section>
  );
  const customizeSection = dieline ? (
        <section aria-labelledby="s-cust" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="s-cust" className="text-lg font-semibold">{mode === "create" ? "Customize the dieline" : "Line roles and preview"}</h2>
              <p className="text-sm text-muted-foreground">Tell us what each kind of line means. We guessed from colour and dashes; change anything that is wrong.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SvgPreviewButton rawSvg={text} dieline={dieline} roles={roles} onRole={(key, role) => setOverrides((o) => ({ ...o, [key]: role }))} />
              <RoleSampleButton />
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2">
                {dieline.styles.map((st) => (
                  <li key={st.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
                    <svg width="34" height="14" aria-hidden className="shrink-0">
                      <line x1="1" y1="7" x2="33" y2="7" stroke={st.stroke ?? "#000"} strokeWidth="3" strokeDasharray={st.dashed ? "6 3" : undefined} />
                    </svg>
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium">{st.stroke ?? "no colour"}{st.dashed ? ", dashed" : ", solid"}</p>
                      <p className="text-muted-foreground">{st.count} {st.count === 1 ? "line" : "lines"}, {st.strokeWidthMm.toFixed(2)} mm</p>
                    </div>
                    <select
                      aria-label={`Role of ${st.stroke ?? "no colour"}${st.dashed ? " dashed" : " solid"} lines`}
                      className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                      value={roles[st.key]}
                      onChange={(e) => setOverrides({ ...overrides, [st.key]: e.target.value as Role })}
                      style={{ borderLeft: `4px solid ${ROLE_COLOR[roles[st.key] ?? "ignore"]}` }}
                    >
                      {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  {roles[st.key] === "ignore" ? (
                      <label className="flex basis-full items-center gap-1.5 pl-[46px] text-xs text-muted-foreground" title="Customers get an optional 'Reference' switch that draws these lines faint behind the dieline">
                        <input type="checkbox" checked={!noRef.includes(st.key)} onChange={(e) => setNoRef((r) => (e.target.checked ? r.filter((k) => k !== st.key) : [...r, st.key]))} />
                        Show as reference
                      </label>
                    ) : null}
                    </li>
                ))}
              </ul>
              <Button type="button" variant="outline" onClick={() => setOverrides({})}><Wand2 className="size-4" aria-hidden /> Auto-detect again</Button>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {ROLE_ORDER.map((r) => (
                  <div key={r} className="contents">
                    <dt className="font-medium text-foreground">{ROLE_LABELS[r]}</dt>
                    <dd>{ROLE_HINTS[r]}</dd>
                  </div>
                ))}
              </dl>
              {!hasCut ? <p role="alert" className="text-sm text-destructive">Mark at least one style as Cut.</p> : !hasClosedCut ? <p role="alert" className="text-sm text-destructive">The Cut lines must include a closed outline (the outer shape of the box).</p> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Button type="button" variant="outline" onClick={() => setReplay((n) => n + 1)}><RotateCcw className="size-4" aria-hidden /> Replay animation</Button>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showBleed} onChange={(e) => setShowBleed(e.target.checked)} /> Bleed</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> Guides</label>
                <span className="ml-auto text-xs text-muted-foreground">{dieline.widthMm.toFixed(1)} × {dieline.heightMm.toFixed(1)} mm</span>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <ImportedPreview dieline={dieline} roles={previewRoles} animate replayKey={replay} className="mx-auto max-h-[60vh] w-full" />
              </div>
              <p className="text-xs text-muted-foreground">Customers can resize this sheet, add artwork, and export it. The 3D fold is set up in its own step (create) or section (edit).</p>
            </div>
          </div>
        </section>
  ) : null;
  const foldSection = flat ? (
    <section aria-label="3D fold" className="flex flex-col gap-4">
      <FoldSetupEditor flat={flat} fold={fold} stale={foldStale} barBottom={mode === "edit" ? "4.75rem" : "0.75rem"} onChange={(f) => { setFold(f); setFoldKey(flatKey); }} />
    </section>
  ) : null;
  const detailsFields = (
    <>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Name
              <input
                className={field}
                value={name}
                maxLength={120}
                aria-invalid={!nameOk}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Slug (public address)
              <input
                className={`${field} font-mono`}
                value={slug}
                maxLength={80}
                disabled={mode === "edit" && builtin}
                aria-invalid={!slugOk}
                aria-describedby="slug-hint"
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
              />
              <span id="slug-hint" className="text-xs font-normal text-muted-foreground">
                {!slugOk
                  ? "Lowercase letters, digits and single dashes, 2 to 80 characters."
                  : mode === "edit" && builtin
                    ? "A built-in template keeps its address."
                    : mode === "edit" && slug !== initial.slug
                      ? `New page: /template/dieline/${slug}. The old address will stop working.`
                      : `Page: /template/dieline/${slug}`}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Description
              <textarea className={`${field} h-24 py-2`} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Display order
              <input className={`${field} w-32`} type="number" min={0} max={100000} step={1} value={sortOrder} onChange={(e) => setSortOrder(Math.max(0, Math.min(100000, Math.trunc(Number(e.target.value)) || 0)))} />
              <span className="text-xs font-normal text-muted-foreground">Lower numbers come first in the template library.</span>
            </label>
            {initial.material ? <DefaultMaterialField min={initial.material.min} max={initial.material.max} value={defaultThickness} onChange={setDefaultThickness} /> : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              Published (visible on the public site)
            </label>
            {!published ? <p role="status" className="-mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Not published: customers will not see this template in the library until you publish it.</p> : null}
            
    </>
  );
  const backgroundFieldset = (
    <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
              <legend className="px-1 text-sm font-medium">Box background image</legend>
              <p className="text-xs text-muted-foreground">
                {builtin
                  ? "A starting picture for the box: new projects from this template begin with it as their box background (customers can change or remove it)."
                  : "A picture that fills the box on this template's page, inside the cut outline."}
              </p>
              <div className="flex items-center gap-3">
                <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                  {bgShown ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin preview (object URL or private route)
                    <img src={bgShown} alt="Box background preview" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={bgInput} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose background image" onChange={(e) => { onBgFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <Button type="button" variant="outline" onClick={() => bgInput.current?.click()}><ImagePlus className="size-4" aria-hidden /> {bgShown ? "Replace" : "Upload image"}</Button>
                  {bgShown ? (
                    <Button type="button" variant="outline" onClick={() => { setBgFile(null); setBgRemoved(true); }}><Trash2 className="size-4" aria-hidden /> Remove</Button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">PNG or JPEG, up to 10 MB. {bgFile ? "It is uploaded when you save." : ""}</p>
            </fieldset>
  );
  const summaryAside = (
    <aside className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
            <h3 className="font-medium">Summary</h3>
            <div className="flex flex-wrap gap-1">
              {categories.filter((c) => categoryIds.includes(c.id)).map((c) => <span key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.name}</span>)}
            </div>
            {dieline ? (
              <>
                <div className="rounded-md border bg-white p-2"><ImportedPreview dieline={dieline} roles={roles} className="mx-auto max-h-48 w-full" /></div>
                <p className="text-xs text-muted-foreground">{dieline.widthMm.toFixed(1)} × {dieline.heightMm.toFixed(1)} mm</p>
              </>
            ) : <p className="text-xs text-muted-foreground">Built-in template: its geometry comes from the dieline generator.</p>}
          </aside>
  );

  // ---- edit mode: one page with every section, a section menu and a sticky save bar
  if (mode === "edit") {
    const problems = [
      !nameOk ? "Name needs at least 2 characters." : null,
      !slugOk ? "Fix the slug." : null,
      categoryIds.length === 0 ? "Choose at least one category." : null,
      !builtin && !hasCut ? "Mark at least one line style as Cut." : null,
      !builtin && hasCut && !hasClosedCut ? "The Cut lines must include a closed outline." : null,
      !builtin && foldStale ? "The lines changed: detect the 3D fold again, or make the template flat only." : null,
      !builtin && !foldStale && foldProblems.length ? "Fix the problems in the 3D fold." : null,
    ].filter((x): x is string => x !== null);
    const canSave = dirty && problems.length === 0 && !saving;
    const sections = [
      { id: "sec-details", label: "Details" },
      { id: "sec-categories", label: "Categories" },
      { id: "sec-background", label: "Background image" },
      ...(builtin ? [] : [{ id: "sec-dieline", label: "Dieline file" }, ...(dieline ? [{ id: "sec-lines", label: "Line roles" }, { id: "sec-fold", label: "3D fold" }] : [])]),
      ...(builtin || initial.fold ? [{ id: "sec-view", label: "Starting 3D view" }] : []),
    ];
    const card = "scroll-mt-24 rounded-2xl border bg-card p-5 shadow-xs";
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
          <nav aria-label="Sections" className="lg:sticky lg:top-20 lg:self-start">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col">
              {sections.map((x) => (
                <li key={x.id} className="shrink-0">
                  <a
                    href={`#${x.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(x.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    aria-current={activeSection === x.id ? "location" : undefined}
                    className={`block rounded-lg px-3 py-1.5 text-sm ${activeSection === x.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                  >
                    {x.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-6">
            <section id="sec-details" aria-labelledby="s-det" className={card}>
              <h2 id="s-det" className="mb-4 text-lg font-semibold">Details</h2>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="flex max-w-xl flex-col gap-4">{detailsFields}</div>
                {summaryAside}
              </div>
            </section>
            <div id="sec-categories" className={card}>{categoriesSection}</div>
            <div id="sec-background" className={card}>{backgroundFieldset}</div>
            {!builtin ? <div id="sec-dieline" className={card}>{svgSection}</div> : null}
            {!builtin && customizeSection ? <div id="sec-lines" className={card}>{customizeSection}</div> : null}
            {!builtin && foldSection ? <div id="sec-fold" className={card}>{foldSection}</div> : null}
            {builtin || initial.fold ? (
              <section id="sec-view" aria-labelledby="s-view" className={card}>
                <h2 id="s-view" className="mb-1 text-lg font-semibold">Starting 3D view</h2>
                <p className="mb-4 text-sm text-muted-foreground">Set how the 3D preview looks when a customer opens this template. It is saved on its own, not with the Save button below.{!builtin && !foldOk ? " Save the 3D fold first." : ""}</p>
                <ViewSettingsInline slug={initial.slug} />
              </section>
            ) : null}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 backdrop-blur" role="region" aria-label="Save">
          <div className="min-w-0 text-sm" aria-live="polite">
            {problems.length ? <span className="text-destructive">{problems[0]}</span> : dirty ? <span className="font-medium">Unsaved changes</span> : <span className="text-muted-foreground">All changes saved</span>}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/doraadmin/templates" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Back to list</Link>
            <Button type="button" className="h-10" disabled={!canSave} onClick={() => void save()} title="Ctrl/Cmd + S">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- create mode: the stepper
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add template" description="Upload an SVG dieline, choose what each line means, and set how it folds in 3D." actions={
      <ol className="flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-xs" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className="shrink-0">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${i === step ? "bg-accent font-medium text-accent-foreground" : i < step ? "text-foreground hover:bg-muted" : "cursor-not-allowed text-muted-foreground/70"}`}
            >
              <span className={`grid size-5 place-items-center rounded-full text-xs ${i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground" : "border"}`}>{i < step ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>
      } />

      <div className="rounded-2xl border bg-card p-5 shadow-xs sm:p-7">
      {stepName === "Categories" ? categoriesSection : null}
      {stepName === "SVG file" ? svgSection : null}
      {stepName === "Customize" ? customizeSection : null}
      {stepName === "3D fold" ? foldSection : null}
      {stepName === "Details" || stepName === "Details & publish" ? (
        <section aria-labelledby="s-det" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex max-w-xl flex-col gap-4">
            <h2 id="s-det" className="text-lg font-semibold">Details</h2>
            {detailsFields}
            {backgroundFieldset}
          </div>
          {summaryAside}
        </section>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div className="flex items-center gap-2">
          <Link href="/doraadmin/templates" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Cancel</Link>
        </div>
        <div className="flex items-center gap-3">
          {blocker ? <span className="text-sm text-muted-foreground">{blocker}</span> : stepName === "Categories" ? <span className="text-sm text-muted-foreground">{categoryIds.length} selected</span> : null}
          {step > 0 ? <Button type="button" variant="outline" className="h-10" onClick={() => setStep(step - 1)}>Back</Button> : null}
          {step < steps.length - 1 ? (
            <Button type="button" className="h-10" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button type="button" className="h-10" disabled={saving || !nameOk || !slugOk} onClick={() => void save()}>
              {saving ? "Saving…" : mode === "create" ? "Create template" : "Save changes"}
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
