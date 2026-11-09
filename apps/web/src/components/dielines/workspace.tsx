"use client";

import { useActionState, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Info, Layers, Printer, Ruler, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { ParamValidationError, getGenerator, type DielineGeometry, type ParamDescriptor, type ParamGroup } from "@packaging/dieline-engine";
import { STYLE, dielineViewBox, renderDielineSvg } from "@packaging/render-svg";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { notify } from "@/lib/notify";
import { svgDataUrl } from "@/lib/dieline-preview";
import { createProject, createProjectDraft, updateProject, type DesignState } from "@/app/(app)/projects/actions";
import type { CartonViewHandle } from "@/components/viewer3d/carton-view";
import { MaterialPicker, ParamField } from "./settings-fields";
import { DIELINE_TOGGLES, SheetCanvas, type ViewToggles } from "./sheet-canvas";
import { FormatCard, FoldPreview, type DownloadFormat } from "./side-cards";
import { CUSTOM_GRADE, MATERIAL_TYPES, materialFor, withUnitLabels, type Unit } from "./units";

type Values = Record<string, string>;
type Mode = { kind: "create"; presetId: string } | { kind: "edit"; projectId: string };
type TabId = ParamGroup | "Info";

interface Props {
  mode: Mode;
  generatorId: string;
  title: string;
  description: string;
  initialName: string;
  initialParams: Record<string, unknown>;
  backHref: string;
  backLabel: string;
}

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "Dimensions", label: "Size", icon: Ruler },
  { id: "Structure", label: "Structure", icon: Boxes },
  { id: "Material", label: "Material", icon: Layers },
  { id: "Print", label: "Print", icon: Printer },
  { id: "Flaps (advanced)", label: "Flaps", icon: SlidersHorizontal },
  { id: "Info", label: "Info", icon: Info },
];

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

export function DielineWorkspace({ mode, generatorId, title, description, initialName, initialParams, backHref, backLabel }: Props) {
  const router = useRouter();
  const gen = getGenerator(generatorId);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(gen.params.map((p) => [p.key, initialParams[p.key] === undefined ? "" : String(initialParams[p.key])])),
  );
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<Unit>("mm");
  const [tab, setTab] = useState<TabId>("Dimensions");
  const [toggles, setToggles] = useState<ViewToggles>({ bleed: true, safe: false, glue: true, dimensions: true, labels: false });
  const [progress, setProgress] = useState(1);
  const [material, setMaterial] = useState(() => {
    const t = Number(initialParams.thickness);
    return materialFor(Number.isFinite(t) && t > 0 ? t : 0.5);
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

  const src = useMemo(
    () =>
      shown
        ? svgDataUrl(
            renderDielineSvg(withUnitLabels(shown, unit), {
              showBleed: toggles.bleed,
              showSafe: toggles.safe,
              showGlue: toggles.glue,
              showAnnotations: toggles.dimensions,
              showPanelLabels: toggles.labels,
            }),
          )
        : null,
    [shown, unit, toggles],
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
  const hasThickness = gen.params.some((p) => p.key === "thickness");

  const materialType = MATERIAL_TYPES.find((t) => t.id === material.typeId) ?? MATERIAL_TYPES[0]!;
  const setThickness = (mm: number) => setValues((s) => ({ ...s, thickness: String(mm) }));
  const pickType = (typeId: string) => {
    const t = MATERIAL_TYPES.find((x) => x.id === typeId)!;
    const g = t.grades[0]!;
    setMaterial({ typeId, gradeId: g.id });
    if (hasThickness) setThickness(g.thickness);
  };
  const pickGrade = (gradeId: string) => {
    setMaterial({ typeId: material.typeId, gradeId });
    const g = materialType.grades.find((x) => x.id === gradeId);
    if (g && hasThickness) setThickness(g.thickness);
  };
  const customThickness = material.gradeId === CUSTOM_GRADE;

  const tabs = TABS.filter((t) => t.id === "Info" || gen.params.some((p) => p.group === t.id));
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id;

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

  const legend = [
    { label: "Cut", color: STYLE.cut.stroke },
    { label: "Crease", color: STYLE.crease.stroke, dashed: true },
    ...(toggles.glue ? [{ label: "Glue area", color: STYLE.glue.fill }] : []),
    ...(toggles.bleed ? [{ label: "Bleed", color: STYLE.bleed.stroke, dashed: true }] : []),
    ...(toggles.safe ? [{ label: "Safe area", color: STYLE.safe.stroke, dashed: true }] : []),
  ];

  const fields = (group: ParamGroup) =>
    gen.params
      .filter((p) => p.group === group && (!p.showWhen || values[p.showWhen.key] === p.showWhen.equals) && !(group === "Material" && hasThickness && p.key === "thickness"))
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
  const thickness = gen.params.find((p) => p.key === "thickness");

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <form id="project-form" action={formAction}>
        {mode.kind === "create" ? <input type="hidden" name="presetId" value={mode.presetId} /> : <input type="hidden" name="projectId" value={mode.projectId} />}
        <input type="hidden" name="params" value={JSON.stringify(input)} />
      </form>

      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <Link href={backHref} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" aria-label={`Back to ${backLabel}`}>
          <ArrowLeft className="size-4" /> {backLabel}
        </Link>
        <span className="h-5 w-px bg-border" aria-hidden />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="project-name">Project name</label>
          <input
            id="project-name"
            form="project-form"
            name="name"
            value={name}
            maxLength={120}
            required
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-44 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {mode.kind === "edit" ? (
            <Link href={`/editor/${mode.projectId}`} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted">
              Design artwork
            </Link>
          ) : null}
          {mode.kind === "edit" ? <DeleteProjectButton projectId={mode.projectId} name={name} /> : null}
          <button
            type="submit"
            form="project-form"
            disabled={pending || !result.geo}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            {pending ? "Saving…" : mode.kind === "create" ? "Create project" : "Save changes"}
          </button>
        </div>
      </header>

      {state.message || result.error || otherIssues.length ? (
        <div role={state.ok && !result.error && !otherIssues.length ? "status" : "alert"} className={`border-b px-4 py-2 text-sm ${state.ok && !result.error && !otherIssues.length ? "text-green-700" : "bg-destructive/10 text-destructive"}`}>
          {result.error ?? (otherIssues.length ? otherIssues.map((i) => `${i.path}: ${i.message}`).join("; ") : state.message)}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[372px_minmax(0,1fr)_340px]">
        {/* Left: icon rail + settings */}
        <aside className="flex min-h-0 flex-col border-b lg:flex-row lg:border-r lg:border-b-0">
          <div role="tablist" aria-label="Settings sections" aria-orientation="vertical" className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 lg:w-[72px] lg:flex-col lg:border-r lg:border-b-0">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={activeTab === t.id}
                aria-controls="settings-panel"
                onClick={() => setTab(t.id)}
                className={`flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs transition-colors ${activeTab === t.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                <t.icon className="size-5" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>

          <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {activeTab === "Dimensions" ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Custom size</h2>
                  <div role="radiogroup" aria-label="Units" className="flex rounded-lg border p-0.5 text-xs">
                    {(["mm", "in"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        role="radio"
                        aria-checked={unit === u}
                        onClick={() => setUnit(u)}
                        className={`rounded-md px-2.5 py-1 ${unit === u ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                {fields("Dimensions")}
                {sheet ? <p className="text-xs text-muted-foreground">Flat sheet {(unit === "mm" ? sheet.w : sheet.w / 25.4).toFixed(unit === "mm" ? 1 : 2)} × {(unit === "mm" ? sheet.h : sheet.h / 25.4).toFixed(unit === "mm" ? 1 : 2)} {unit}, without bleed.</p> : null}
              </>
            ) : activeTab === "Material" ? (
              <>
                <h2 className="font-semibold">Choose material</h2>
                {hasThickness ? <MaterialPicker typeId={material.typeId} gradeId={material.gradeId} onType={pickType} onGrade={pickGrade} /> : null}
                {thickness ? (
                  <ParamField
                    p={thickness}
                    value={values.thickness ?? ""}
                    unit={unit}
                    disabled={!customThickness}
                    {...(issueFor("thickness") ? { error: issueFor("thickness")! } : {})}
                    onChange={(v) => setValues((s) => ({ ...s, thickness: v }))}
                  />
                ) : null}
                {fields("Material")}
              </>
            ) : activeTab === "Info" ? (
              <>
                <h2 className="font-semibold">Info</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
                {shown && shown.unverifiedDefaultsUsed.length > 0 ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Built-in defaults used for: {shown.unverifiedDefaultsUsed.join(", ")}. They are not taken from an industry standard; confirm them with your printer before production.
                  </div>
                ) : null}
                <h3 className="text-sm font-medium">Geometry checks</h3>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {(shown?.checks ?? []).map((c) => (
                    <li key={c.name} className="flex gap-2">
                      <span className={c.pass ? "text-green-700" : "font-semibold text-destructive"} aria-label={c.pass ? "Pass" : "Fail"}>{c.pass ? "✓" : "✗"}</span>
                      <span><span className="font-medium">{c.name}</span>{c.detail ? <span className="text-muted-foreground"> — {c.detail}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2 className="font-semibold">{activeTab === "Flaps (advanced)" ? "Flaps (advanced)" : activeTab}</h2>
                {fields(activeTab)}
              </>
            )}
          </div>
        </aside>

        {/* Centre: sheet */}
        <main className="flex min-h-[55vh] min-w-0 flex-col lg:min-h-0">
          {shown && src ? (
            <SheetCanvas bounds={dielineViewBox(shown, 22)} src={src} toggles={toggles} toggleDefs={DIELINE_TOGGLES} onToggles={setToggles} legend={legend} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Enter valid dimensions to see the dieline.</p>
          )}
          {!result.geo && shown ? <p role="status" className="border-t px-4 py-1.5 text-xs text-destructive">Showing the last valid shape.</p> : null}
        </main>

        {/* Right: 3D + download */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t p-4 lg:border-t-0 lg:border-l">
          {shown ? <FoldPreview geo={shown} progress={progress} onProgress={setProgress} color={materialType.color} viewRef={viewRef} /> : null}
          <FormatCard
            format={format}
            onFormat={(f) => {
              setFormat(f);
              setDl(null);
            }}
            profile={profile}
            onProfile={setProfile}
            checks={{ pass: shown?.checks.filter((c) => c.pass).length ?? 0, total: shown?.checks.length ?? 0 }}
            unverified={shown?.unverifiedDefaultsUsed ?? []}
            busy={busy}
            onDownload={() => void download()}
            result={dl}
          />
        </aside>
      </div>
    </div>
  );
}
