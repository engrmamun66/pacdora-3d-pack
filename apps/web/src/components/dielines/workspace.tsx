"use client";

import { useActionState, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, CircleAlert, CircleEllipsis, Ruler, type LucideIcon } from "lucide-react";
import { ParamValidationError, createImportedGenerator, scaleImportedPaths, getGenerator, type DielineGeometry, type FlatDieline, type FoldSetup, type ParamDescriptor, type ParamGroup } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import { STYLE, dielineViewBox, outlinePathD, renderDielineSvg } from "@packaging/render-svg";
import { notify } from "@/lib/notify";
import type { ViewSettings } from "@/lib/view-settings";
import { svgDataUrl } from "@/lib/dieline-preview";
import { pathData } from "@/lib/template-import";
import { createProject, createProjectDraft, updateProject, type DesignState } from "@/app/(app)/projects/actions";
import type { CartonViewHandle } from "@/components/viewer3d/carton-view";
import { DielineInfo } from "./dieline-info";
import { boxSizes, dielineStats } from "./info-math";
import { DielineTopBar } from "./dieline-top-bar";
import { TemplatePicker } from "./template-picker";
import { MaterialInfoButton } from "./material-info";
import { MaterialPicker, ParamField, ThicknessField } from "./settings-fields";
import { DIELINE_TOGGLES, SheetCanvas, type ViewToggles } from "./sheet-canvas";
import { DOWNLOAD_FORMATS, FormatCard, FoldPreview, type DownloadFormat } from "./side-cards";
import { materialFor, materialsFor, withUnitLabels, type Unit } from "./units";

type Values = Record<string, string>;
type Mode = { kind: "create"; presetId: string } | { kind: "edit"; projectId: string };

interface Props {
  mode: Mode;
  generatorId: string;
  /** For an imported (SVG) template: its lines, so the generator can be rebuilt here. */
  imported?: { templateId: string; flat: FlatDielineData; fold?: FoldSetup | null };
  /** Camera and fold amount the 3D preview starts with (set per template by an admin). */
  initialView?: ViewSettings | null;
  title: string;
  description: string;
  initialName: string;
  initialParams: Record<string, unknown>;
  /** Template id shown as "Model ID" in the info tab. */
  modelId: string;
  /** Faint text drawn inside the cut area of the sheet ("" = none). Absent = the built-in default. */
  watermark?: string;
}

type TabId = "dielines" | "basic" | "info" | "more";

const IDLE: DesignState = { ok: false, message: null, issues: [] };

/** Turn form strings into engine input: empty optional numbers are omitted (engine default). */
function toInput(params: readonly ParamDescriptor[], values: Values): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of params) {
    if (p.showWhen && values[p.showWhen.key] !== p.showWhen.equals) continue;
    const raw = (values[p.key] ?? "").trim();
    if (raw === "") continue;
    out[p.key] = p.kind === "number" ? Number(raw) : raw;
  }
  return out;
}

type Result = { geo: DielineGeometry; issues: null; error: null } | { geo: null; issues: { path: string; message: string }[]; error: string | null };

const fileBase = (name: string) => name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "dieline";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DielineWorkspace({ mode, generatorId, imported, initialView = null, title, description, initialName, initialParams, modelId, watermark }: Props) {
  const router = useRouter();
  const gen = useMemo(() => (imported ? createImportedGenerator(imported.templateId, imported.flat as FlatDieline, imported.fold ?? null) : getGenerator(generatorId)), [generatorId, imported]);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(gen.params.map((p) => [p.key, initialParams[p.key] === undefined ? "" : String(initialParams[p.key])])),
  );
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<Unit>("mm");
  const [tab, setTab] = useState<TabId>("basic");
  const [toggles, setToggles] = useState<ViewToggles>({ bleed: true, safe: false, glue: true, dimensions: true, partSizes: false, labels: false, reference: false });
  const [progress, setProgress] = useState(initialView?.progress ?? 1);
  const thickness = gen.params.find((p): p is ParamDescriptor & { kind: "number" } => p.key === "thickness" && p.kind === "number");
  const materialTypes = useMemo(() => (thickness ? materialsFor(thickness.min, thickness.max) : []), [thickness]);
  const [material, setMaterial] = useState(() => {
    const t = Number(initialParams.thickness);
    return materialFor(Number.isFinite(t) && t > 0 ? t : 0.5, materialTypes.length ? materialTypes : undefined);
  });
  const [format, setFormat] = useState<DownloadFormat>("pdf");
  const [profile, setProfile] = useState("cc");
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState<{ ok: boolean; title: string; notes: string[] } | null>(null);
  const viewRef = useRef<CartonViewHandle>(null);
  const deferred = useDeferredValue(values);

  const input = useMemo(() => toInput(gen.params, deferred), [gen.params, deferred]);
  const result: Result = useMemo(() => {
    try {
      return { geo: gen.generate(input), issues: null, error: null };
    } catch (e) {
      if (e instanceof ParamValidationError) return { geo: null, issues: [...e.issues], error: null };
      return { geo: null, issues: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [gen, input]);

  // Keep the last good sheet on screen while the user is mid-edit.
  const [lastGood, setLastGood] = useState<DielineGeometry | null>(null);
  if (result.geo && result.geo !== lastGood) setLastGood(result.geo);
  const shown = result.geo ?? lastGood;

  const hasReference = Boolean(imported?.flat.reference?.length);
  const src = useMemo(
    () => {
      if (!shown) return null;
      let svg = renderDielineSvg(withUnitLabels(shown, unit), {
        showBleed: toggles.bleed,
        showSafe: toggles.safe,
        showGlue: toggles.glue,
        showAnnotations: toggles.dimensions,
        showPanelLabels: toggles.labels,
        ...(toggles.partSizes ? { showPartSizes: unit } : {}),
      });
      // Reference lines (ignored in the file, kept by the admin): faint, scaled with the sheet, drawn only on request.
      const ref = imported?.flat.reference;
      const width = (shown.params as { width?: number }).width;
      if (toggles.reference && ref?.length && typeof width === "number") {
        const sizes = shown.params as { baseWidth?: number; baseHeight?: number; boxHeight?: number };
        const d = scaleImportedPaths(imported!.flat as FlatDieline, width, ref, imported!.fold ?? null, { ...(typeof sizes.baseWidth === "number" ? { baseWidth: sizes.baseWidth } : {}), ...(typeof sizes.baseHeight === "number" ? { baseHeight: sizes.baseHeight } : {}), ...(typeof sizes.boxHeight === "number" ? { boxHeight: sizes.boxHeight } : {}) }).map((p) => pathData(p.pts, p.closed)).join("");
        const layer = `<g id="reference" fill="none" stroke="#6b7280" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"><path d="${d}"/></g>`;
        svg = svg.replace(/<\/svg>\s*$/, () => `${layer}\n</svg>\n`); // after the white background, so it shows
      }
      return svgDataUrl(svg);
    },
    [shown, unit, toggles, imported],
  );

  const action = mode.kind === "create" ? createProject : updateProject;
  const [state, formAction, pending] = useActionState<DesignState, FormData>(action, IDLE);

  // Tell the user how Save went (the inline banner stays for screen readers and long messages).
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) notify.success(state.message, { id: "project-save" });
    else notify.error(state.message, { id: "project-save" });
  }, [state]);

  const issueFor = (key: string) => [...(result.issues ?? []), ...state.issues].find((i) => i.path === key || i.path.startsWith(`${key}.`))?.message;
  const otherIssues = (result.issues ?? []).filter((i) => !gen.params.some((p) => i.path === p.key));
  const resolved = (shown?.params ?? {}) as Record<string, unknown>;
  const sheet = shown ? { w: shown.cutBounds.max.x - shown.cutBounds.min.x, h: shown.cutBounds.max.y - shown.cutBounds.min.y } : null;
  const hasThickness = thickness !== undefined && materialTypes.length > 0;

  const materialType = materialTypes.find((t) => t.id === material.typeId) ?? materialTypes[0];
  const materialGrade = materialType?.grades.find((g) => g.id === material.gradeId) ?? materialType?.grades[0];
  const setThickness = (mm: number) => setValues((s) => ({ ...s, thickness: String(mm) }));
  const pickMaterial = (typeId: string, gradeId: string) => {
    const g = materialTypes.find((x) => x.id === typeId)?.grades.find((x) => x.id === gradeId);
    if (!g) return;
    setMaterial({ typeId, gradeId });
    setThickness(g.thickness);
  };
  const boardColor = materialType?.color ?? "#c9a574";

  const formData = (projectId?: string) => {
    const fd = new FormData();
    if (mode.kind === "create") fd.set("presetId", mode.presetId);
    if (projectId) fd.set("projectId", projectId);
    fd.set("name", name);
    fd.set("params", JSON.stringify(input));
    return fd;
  };

  const download = async () => {
    setBusy(true);
    setDl(null);
    try {
      if (!result.geo) throw new Error("Fix the highlighted values first.");
      if (format === "glb") {
        const glb = await viewRef.current?.exportGlb();
        if (!glb) throw new Error("The 3D preview is not ready yet.");
        saveBlob(glb, `${fileBase(name)}.glb`);
        setDl({ ok: true, title: "Downloaded .glb", notes: ["Panels have zero thickness. The model shows the carton at the current fold amount."] });
        notify.info("Downloaded .glb", { description: "Panels have zero thickness." });
        return;
      }
      // Server exports use the saved project, so save the current values first.
      let projectId: string;
      if (mode.kind === "edit") {
        const r = await updateProject(IDLE, formData(mode.projectId));
        if (!r.ok) throw new Error(r.message ?? "Could not save the project.");
        projectId = mode.projectId;
      } else {
        const r = await createProjectDraft(formData());
        if (!r.ok || !r.id) throw new Error(r.message ?? "Could not save the project.");
        projectId = r.id;
      }
      const q = new URLSearchParams({
        format,
        profile,
        artwork: "0",
        dieline: "1",
        bleed: toggles.bleed ? "1" : "0",
        safe: toggles.safe ? "1" : "0",
        glue: toggles.glue ? "1" : "0",
        dimensions: toggles.dimensions ? "1" : "0",
      });
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export?${q}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Download failed (${res.status}).`);
      }
      const report = JSON.parse(decodeURIComponent(res.headers.get("x-export-report") ?? "%7B%7D")) as { losses?: string[] };
      saveBlob(await res.blob(), `${fileBase(name)}.${format}`);
      setDl({ ok: true, title: `Downloaded .${format}`, notes: report.losses ?? [] });
      if (report.losses?.length) notify.warning(`Downloaded .${format} with ${report.losses.length} limitation${report.losses.length === 1 ? "" : "s"}`, { description: report.losses[0] });
      else notify.success(`Downloaded .${format}`);
      if (mode.kind === "create") router.replace(`/projects/${projectId}`);
    } catch (e) {
      setDl({ ok: false, title: "Download failed", notes: [(e as Error).message] });
      notify.error("Download failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Imported dielines are flat: no glue areas or panels to show, and no 3D.
  const foldable = (shown?.foldTree.hinges.length ?? 0) > 0;
  const toggleDefs = imported
    ? [...DIELINE_TOGGLES.filter((t) => t.key === "partSizes" || t.key === "dimensions" || t.key === "bleed" || (t.key === "safe" && (shown?.safeAreas.length ?? 0) > 0)), ...(hasReference ? [{ key: "reference" as const, label: "Reference" }] : [])]
    : DIELINE_TOGGLES;
  const formats = foldable ? DOWNLOAD_FORMATS : DOWNLOAD_FORMATS.filter((f) => f.value !== "glb");

  const legend = [
    { label: "Cut", color: STYLE.cut.stroke },
    { label: "Crease", color: STYLE.crease.stroke, dashed: true },
    ...(toggles.glue && !imported ? [{ label: "Glue area", color: STYLE.glue.fill }] : []),
    ...(toggles.reference && hasReference ? [{ label: "Reference", color: "#6b7280" }] : []),
    ...(toggles.bleed ? [{ label: "Bleed", color: STYLE.bleed.stroke, dashed: true }] : []),
    ...(toggles.safe ? [{ label: "Safe area", color: STYLE.safe.stroke, dashed: true }] : []),
  ];

  const fields = (group: ParamGroup, only?: (p: ParamDescriptor) => boolean) =>
    gen.params
      .filter((p) => p.group === group && (only?.(p) ?? true) && (!p.showWhen || values[p.showWhen.key] === p.showWhen.equals) && !(group === "Material" && hasThickness && p.key === "thickness"))
      .map((p) => (
        <ParamField
          key={p.key}
          p={p}
          value={values[p.key] ?? ""}
          unit={unit}
          {...(p.kind === "number" && typeof resolved[p.key] === "number" ? { placeholderMm: resolved[p.key] as number } : {})}
          {...(issueFor(p.key) ? { error: issueFor(p.key)! } : {})}
          onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
        />
      ));

  const sizeFields = fields("Dimensions", (p) => p.kind === "number" && p.key !== "sizeMode");
  // "Size mode" sits under the thickness (it decides whether the thickness changes the sheet).
  const sizeModeGroup = gen.params.find((p) => p.key === "sizeMode")?.group;
  const sizeMode = sizeModeGroup ? fields(sizeModeGroup, (p) => p.key === "sizeMode") : [];
  const extraGroups: { group: ParamGroup; title: string; open: boolean }[] = [
    { group: "Structure", title: "Structure", open: true },
    { group: "Print", title: "Print", open: true },
    { group: "Flaps (advanced)", title: "Flaps (advanced)", open: false },
  ];
  const issueText = result.error ?? (otherIssues.length ? otherIssues.map((i) => `${i.path}: ${i.message}`).join("; ") : state.message);
  const issueOk = state.ok && !result.error && !otherIssues.length;
  const num = (k: string) => (typeof resolved[k] === "number" ? (resolved[k] as number) : null);
  // The factor the customer typed (only used in Inner mode), else the engine's default of 1.
  const typedAllowance = Number(values.allowanceFactor);
  const allowance = (values.allowanceFactor ?? "").trim() !== "" && Number.isFinite(typedAllowance) ? typedAllowance : 1;
  const [bw, bd, bh, bt] = [num("width"), num("depth"), num("height"), num("thickness")];
  const boxDims =
    bw !== null && bd !== null && bh !== null && bt !== null
      ? boxSizes([bw, bd, bh], typeof resolved.sizeMode === "string" ? resolved.sizeMode : "manufacture", bt, allowance)
      : null;
  const hasMore = extraGroups.some(({ group }) => fields(group, (p) => p.key !== "sizeMode").length > 0);
  const railTabs: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: "dielines", label: "Dielines", icon: Box },
    { id: "basic", label: "Basic", icon: Ruler },
    { id: "info", label: "Info", icon: CircleAlert },
    ...(hasMore ? [{ id: "more" as const, label: "More", icon: CircleEllipsis }] : []),
  ];
  const activeTab: TabId = railTabs.some((t) => t.id === tab) ? tab : "basic";

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <form id="project-form" action={formAction}>
        {mode.kind === "create" ? <input type="hidden" name="presetId" value={mode.presetId} /> : <input type="hidden" name="projectId" value={mode.projectId} />}
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="params" value={JSON.stringify(input)} />
      </form>

      <DielineTopBar
        title={title}
        name={name}
        onName={setName}
        mode={mode.kind}
        projectId={mode.kind === "edit" ? mode.projectId : null}
        saving={pending}
        canSave={Boolean(result.geo) && name.trim().length > 0}
        downloading={busy}
        canDownload={Boolean(result.geo)}
        downloadLabel="Download the dieline"
        onDownload={() => void download()}
      />

      {issueText ? (
        <div role={issueOk ? "status" : "alert"} className={`border-b px-4 py-2 text-sm ${issueOk ? "text-green-700" : "bg-destructive/10 text-destructive"}`}>
          {issueText}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[372px_minmax(0,1fr)_340px]">
        {/* Left: vertical menu (Dielines, Basic, Info, More) and the panel of the chosen one */}
        <aside className="flex min-h-0 flex-col border-b lg:flex-row lg:border-r lg:border-b-0">
          <div role="tablist" aria-label="Settings sections" aria-orientation="vertical" className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 lg:w-[76px] lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0">
            {railTabs.map((t, i) => (
              <div key={t.id} className="contents">
                {t.id === "more" && i > 0 ? <span aria-hidden className="mx-1 my-1 hidden h-px bg-border lg:block" /> : null}
                <button
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={activeTab === t.id}
                  aria-controls="settings-panel"
                  onClick={() => setTab(t.id)}
                  className={`flex min-w-16 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs transition-colors ${activeTab === t.id ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted"}`}
                >
                  <t.icon className="size-6" aria-hidden />
                  {t.label}
                </button>
              </div>
            ))}
          </div>

          <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
            {activeTab === "dielines" ? (
              <TemplatePicker currentId={mode.kind === "create" ? mode.presetId : ""} mode={mode.kind} />
            ) : activeTab === "basic" ? (
              <>
                <section aria-labelledby="sec-size" className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 id="sec-size" className="font-semibold">Custom size</h2>
                    <div role="radiogroup" aria-label="Units" className="flex rounded-lg border p-0.5 text-xs">
                      {(["mm", "in"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          role="radio"
                          aria-checked={unit === u}
                          onClick={() => setUnit(u)}
                          className={`rounded-md px-2.5 py-1 ${unit === u ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">{sizeFields}</div>
                  {!(hasThickness && thickness) ? sizeMode : null}
                  {sheet ? <p className="text-xs text-muted-foreground">Flat sheet {(unit === "mm" ? sheet.w : sheet.w / 25.4).toFixed(unit === "mm" ? 1 : 2)} × {(unit === "mm" ? sheet.h : sheet.h / 25.4).toFixed(unit === "mm" ? 1 : 2)} {unit}, without bleed.</p> : null}
                </section>

                {hasThickness && thickness ? (
                  <section aria-labelledby="sec-material" className="flex flex-col gap-3 border-t pt-5">
                    <div className="flex items-center gap-1.5">
                      <h2 id="sec-material" className="font-semibold">Choose material</h2>
                      <MaterialInfoButton />
                    </div>
                    <MaterialPicker types={materialTypes} typeId={material.typeId} gradeId={material.gradeId} unit={unit} onPick={pickMaterial} />
                    <ThicknessField
                      p={thickness}
                      value={values.thickness || (typeof resolved.thickness === "number" ? String(resolved.thickness) : "")}
                      unit={unit}
                      grade={materialGrade}
                      {...(issueFor("thickness") ? { error: issueFor("thickness")! } : {})}
                      onChange={(v) => setValues((s) => ({ ...s, thickness: v }))}
                    />
                    {sizeMode}
                    {fields("Material")}
                  </section>
                ) : null}
              </>
            ) : activeTab === "info" ? (
              <DielineInfo
                description={description}
                modelId={modelId}
                unit={unit}
                stats={shown ? dielineStats(shown) : null}
                sizes={boxDims}
                overall={sheet}
                checks={shown?.checks ?? []}
                unverified={shown?.unverifiedDefaultsUsed ?? []}
              />
            ) : (
              <>
                {extraGroups.map(({ group, title: groupTitle, open }, i) => {
                  const list = fields(group, (p) => p.key !== "sizeMode");
                  if (list.length === 0) return null;
                  return (
                    <details key={group} open={open} className={`group ${i > 0 ? "border-t pt-4" : ""}`}>
                      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
                        {groupTitle}
                        <span aria-hidden className="text-base leading-none text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
                      </summary>
                      <div className="mt-3 flex flex-col gap-3">{list}</div>
                    </details>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* Centre: sheet */}
        <main className="flex min-h-[55vh] min-w-0 flex-col lg:min-h-0">
          {shown && src ? (
            <SheetCanvas {...(watermark === undefined ? {} : { watermark })} bounds={dielineViewBox(shown, 22)} watermarkClip={shown.cutLoops.map(outlinePathD).join(" ")} src={src} toggles={toggles} toggleDefs={toggleDefs} onToggles={setToggles} legend={legend} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Enter valid dimensions to see the dieline.</p>
          )}
          {!result.geo && shown ? <p role="status" className="border-t px-4 py-1.5 text-xs text-destructive">Showing the last valid shape.</p> : null}
        </main>

        {/* Right: 3D + file formats */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t p-4 lg:border-t-0 lg:border-l">
          {shown && foldable ? <FoldPreview initialView={initialView} geo={shown} progress={progress} onProgress={setProgress} color={boardColor} viewRef={viewRef} /> : null}
          {shown && !foldable ? (
            <section aria-label="Imported dieline" className="shrink-0 rounded-2xl border p-4 text-sm">
              <h2 className="font-semibold">Imported dieline</h2>
              <p className="mt-1 text-xs text-muted-foreground">The shape is fixed: you can change its overall size, bleed and artwork. The 3D fold preview is not available for it.</p>
            </section>
          ) : null}
          <FormatCard
            formats={formats}
            format={format}
            onFormat={(f) => {
              setFormat(f);
              setDl(null);
            }}
            profile={profile}
            onProfile={setProfile}
            checks={{ pass: shown?.checks.filter((c) => c.pass).length ?? 0, total: shown?.checks.length ?? 0 }}
            unverified={shown?.unverifiedDefaultsUsed ?? []}
            result={dl}
          />
        </aside>
      </div>
    </div>
  );
}
