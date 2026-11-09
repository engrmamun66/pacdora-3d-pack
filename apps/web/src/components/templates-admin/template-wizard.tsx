"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileUp, RotateCcw, Wand2 } from "lucide-react";
import { SvgImportError, importSvg, suggestRoles, type ImportedDieline, type Role } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { saveTemplate } from "@/app/doraadmin/template-actions";
import { notify } from "@/lib/notify";
import { isValidSlug, slugify } from "@/lib/slug";
import { MAX_SVG_CHARS, ROLE_COLOR, ROLE_HINTS, ROLE_LABELS, ROLE_ORDER } from "@/lib/template-import";
import { ImportedPreview } from "./imported-preview";

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
  categoryIds: string[];
  source: "builtin" | "svg" | null;
  dieline: ImportedDieline | null;
  roles: Record<string, Role>;
  options: Options;
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
export function TemplateWizard({ mode, categories, initial }: { mode: "create" | "edit"; categories: WizardCategory[]; initial: WizardInitial }) {
  const router = useRouter();
  const builtin = initial.source === "builtin";
  const steps = builtin ? ["Categories", "Details"] : ["Categories", "SVG file", "Customize", "Details & publish"];

  const [step, setStep] = useState(0);
  const [categoryIds, setCategoryIds] = useState<string[]>(initial.categoryIds);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [opts, setOpts] = useState<Options>(initial.options);
  const [overrides, setOverrides] = useState<Record<string, Role>>(initial.roles);
  const [showBleed, setShowBleed] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [replay, setReplay] = useState(0);
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(initial.description);
  const [published, setPublished] = useState(initial.published);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = useMemo<Parsed | null>(() => (text ? tryImport(text, opts) : null), [text, opts]);
  const dieline: ImportedDieline | null = parsed?.ok ? parsed.dieline : parsed ? null : initial.dieline;
  const suggested = useMemo(() => (dieline ? suggestRoles(dieline.styles) : {}), [dieline]);
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

  const hasCut = Object.values(roles).includes("cut");
  const slugOk = isValidSlug(slug);
  const nameOk = name.trim().length >= 2;
  const stepName = steps[step]!;

  const canNext =
    stepName === "Categories" ? categoryIds.length > 0 :
    stepName === "SVG file" ? dieline !== null :
    stepName === "Customize" ? dieline !== null && hasCut :
    true;
  const blocker =
    stepName === "Categories" && categoryIds.length === 0 ? "Choose at least one category." :
    stepName === "SVG file" && dieline === null ? "Upload an SVG file to continue." :
    stepName === "Customize" && !hasCut ? "Mark at least one line style as Cut." : null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_SVG_CHARS) return notify.error("That file is too large", { description: "SVG files up to 3 MB are accepted." });
    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") return notify.error("Please choose an .svg file");
    const t = await file.text();
    setText(t);
    setFileName(file.name);
    setOverrides({});
    if (!name.trim() && mode === "create") {
      const guess = file.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim();
      setName(guess);
      if (!slugTouched) setSlug(slugify(guess));
    }
  }

  async function save() {
    if (!nameOk || !slugOk) return;
    setSaving(true);
    try {
      const r = await saveTemplate({
        mode, slug, name, description, published, categoryIds,
        ...(text ? { svg: text } : {}),
        unit: opts.unit, scale: opts.scale, pxPerInch: opts.pxPerInch,
        roles,
      });
      if (r.ok) {
        notify.success(r.message);
        router.push("/doraadmin/templates");
        router.refresh();
      } else notify.error(r.message);
    } catch {
      notify.error("Could not save the template. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const toggleCategory = (id: string) => setCategoryIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${i === step ? "border-primary bg-primary/5 font-medium" : i < step ? "hover:bg-muted" : "text-muted-foreground"}`}
            >
              <span className={`grid size-5 place-items-center rounded-full text-xs ${i < step ? "bg-primary text-primary-foreground" : "border"}`}>{i < step ? <Check className="size-3" aria-hidden /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {/* ---------------------------------------------------------- 1. categories */}
      {stepName === "Categories" ? (
        <section aria-labelledby="s-cat" className="flex flex-col gap-5">
          <div>
            <h2 id="s-cat" className="text-lg font-semibold">Choose categories</h2>
            <p className="text-sm text-muted-foreground">A template can be in several: for example Food (by use) and Tuck End Boxes (by model). Pick at least one.</p>
          </div>
          {(["use", "model"] as const).map((k) => (
            <fieldset key={k} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{k === "use" ? "By uses" : "By models"}</legend>
              <div className="flex flex-wrap gap-2">
                {categories.filter((c) => c.kind === k).map((c) => {
                  const on = categoryIds.includes(c.id);
                  return (
                    <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCategory(c.id)} />
                      {on ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 2. svg */}
      {stepName === "SVG file" ? (
        <section aria-labelledby="s-svg" className="flex flex-col gap-5">
          <div>
            <h2 id="s-svg" className="text-lg font-semibold">Upload the dieline SVG</h2>
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
              <select className={field} value={opts.unit} onChange={(e) => setOpts({ ...opts, unit: e.target.value as Unit })}>
                <option value="auto">Auto-detect</option>
                <option value="mm">Millimetres</option>
                <option value="cm">Centimetres</option>
                <option value="in">Inches</option>
                <option value="pt">Points</option>
                <option value="px">Pixels</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Scale (×)
              <input className={field} type="number" min={0.001} max={1000} step="any" value={opts.scale} onChange={(e) => setOpts({ ...opts, scale: Number(e.target.value) || 1 })} />
            </label>
            {opts.unit === "px" || opts.unit === "auto" ? (
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
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-800">
                  {dieline.report.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">Check the size against the real box. If it is wrong, change the units or scale above.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 3. customise */}
      {stepName === "Customize" && dieline ? (
        <section aria-labelledby="s-cust" className="flex flex-col gap-4">
          <div>
            <h2 id="s-cust" className="text-lg font-semibold">Customize the dieline</h2>
            <p className="text-sm text-muted-foreground">Tell us what each kind of line means. We guessed from colour and dashes; change anything that is wrong.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2">
                {dieline.styles.map((st) => (
                  <li key={st.key} className="flex items-center gap-3 rounded-lg border p-2.5">
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
              {!hasCut ? <p role="alert" className="text-sm text-destructive">Mark at least one style as Cut.</p> : null}
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
              <p className="text-xs text-muted-foreground">The preview animates the drawing. Folding this sheet into a 3D box (and placing artwork on its panels) is not available for imported dielines yet.</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 4. details */}
      {stepName === "Details" || stepName === "Details & publish" ? (
        <section aria-labelledby="s-det" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex max-w-xl flex-col gap-4">
            <h2 id="s-det" className="text-lg font-semibold">Details</h2>
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
                disabled={mode === "edit"}
                aria-invalid={!slugOk}
                aria-describedby="slug-hint"
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
              />
              <span id="slug-hint" className="text-xs font-normal text-muted-foreground">
                {mode === "edit" ? "The address cannot change after creation." : slugOk ? `Page: /template/dieline/${slug}` : "Lowercase letters, digits and single dashes, 2 to 80 characters."}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Description
              <textarea className={`${field} h-24 py-2`} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              Published (visible on the public site)
            </label>
          </div>
          <aside className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
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
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <Link href="/doraadmin/templates" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Cancel</Link>
        </div>
        <div className="flex items-center gap-3">
          {blocker ? <span className="text-xs text-muted-foreground">{blocker}</span> : null}
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
  );
}
