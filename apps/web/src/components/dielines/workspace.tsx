"use client";

import { useActionState, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, CircleAlert, CircleEllipsis, Ruler, type LucideIcon } from "lucide-react";
import { ParamValidationError, applyWindows, type WatermarkSpec, type WindowSpec, createImportedGenerator, creaseSizesOf, scaleImportedPaths, getGenerator, type DielineGeometry, type FlatDieline, type FoldSetup, type ParamDescriptor, type ParamGroup } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import { STYLE, dielineViewBox, outlinePathD, renderDielineSvg } from "@packaging/render-svg";
import { notify } from "@/lib/notify";
import type { ViewSettings } from "@/lib/view-settings";
import { svgDataUrl } from "@/lib/dieline-preview";
import { pathData } from "@/lib/template-import";
import { createProject, createProjectDraft, saveProjectAs, updateProject, type DesignState } from "@/app/(app)/projects/actions";
import type { CartonViewHandle } from "@/components/viewer3d/carton-view";
import { panelAt, panelShapes } from "@/lib/panel-hit";
import { withViewTab, type ViewTab } from "@/lib/view-tab";
import { DielineInfo } from "./dieline-info";
import { boxSizes, dielineStats } from "./info-math";
import { DielineTopBar } from "./dieline-top-bar";
import { WindowEditor } from "./window-editor";
import { SWAP_EASE, SWAP_MS, SkeletonOverlay, SwapIn, ViewSkeleton, useViewSwitch } from "./view-switch";
import { MiniSheet } from "./mini-sheet";
import type { SaveAsOptions } from "@/server/projects";
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
  /** The tab to open (from the `?view=` query, so a reload keeps it). */
  initialTab?: ViewTab;
  title: string;
  description: string;
  initialName: string;
  initialParams: Record<string, unknown>;
  /** Template id shown as "Model ID" in the info tab. */
  modelId: string;
  /** The watermark on the sheet and in downloads; null = none. Absent = the default look on screen only. */
  watermark?: WatermarkSpec | null;
  /** The signed-in visitor (profile icon in the header); null/absent = signed out. */
  viewer?: { name: string; email: string; image: string | null } | null;
  /** The visitor's own categories and tags for "Save as" (absent or empty lists = nothing to choose). */
  saveOptions?: SaveAsOptions | null;
  /** Window holes the project already has. */
  initialWindows?: readonly WindowSpec[];
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

/** How long the sidebars take to close or open (Split tab); the slow views are built after it, so the motion is not interrupted. Matches `duration-500` on the grid. */
const SIDEBAR_MS = 520;

export function DielineWorkspace({ mode, generatorId, imported, initialView = null, initialTab = "dieline", title, description, initialName, initialParams, modelId, watermark, viewer = null, saveOptions = null, initialWindows = [] }: Props) {
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
  const base = result.geo ?? lastGood;
  // Window holes the customer placed (see the window editor): cut into the box, so the sheet, the 3D box and the downloads show them.
  const [windows, setWindows] = useState<WindowSpec[]>(() => [...initialWindows]);
  // The window editor slides over the page and slides away again: "open" and "closing" are the two animated moments.
  const [windowsView, setWindowsView] = useState<"closed" | "open" | "closing">("closed");
  const [bodyHidden, setBodyHidden] = useState(false); // the page behind it is only hidden once the editor has settled
  const editingWindows = windowsView === "open";
  const openWindows = () => setWindowsView("open");
  const closeWindows = () => {
    setBodyHidden(false);
    setWindowsView("closing");
  };
  useEffect(() => {
    if (windowsView === "open") {
      const t = window.setTimeout(() => setBodyHidden(true), 420);
      return () => window.clearTimeout(t);
    }
    if (windowsView === "closing") {
      const t = window.setTimeout(() => setWindowsView("closed"), 320);
      return () => window.clearTimeout(t);
    }
  }, [windowsView]);
  const windowResult = useMemo(() => (base ? applyWindows(base, windows) : null), [base, windows]);
  const shown = windowResult?.geo ?? base;
  /** Dielines with a 3D fold have the Dieline | 3D | Split tabs; others only show the sheet (a `?view=` for them is ignored). */
  const foldable = (shown?.foldTree.hinges.length ?? 0) > 0;

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
        const d = scaleImportedPaths(imported!.flat as FlatDieline, width, ref, imported!.fold ?? null, creaseSizesOf(shown.params)).map((p) => pathData(p.pts, p.closed)).join("");
        const layer = `<g id="reference" fill="none" stroke="#6b7280" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"><path d="${d}"/></g>`;
        svg = svg.replace(/<\/svg>\s*$/, () => `${layer}\n</svg>\n`); // after the white background, so it shows
      }
      return svgDataUrl(svg);
    },
    [shown, unit, toggles, imported],
  );

  // Dieline | 3D. The tab changes at once; the slow view is built behind a placeholder, and the tabs wait until it is drawn.
  const sw = useViewSwitch<ViewTab>(initialTab, (from, to) => (from === "split" || to === "split" ? SIDEBAR_MS : 0), (from, to) => from !== "split" && to !== "split");
  const centre = foldable ? sw.mounted : "dieline";
  /** The Split tab is chosen (at once, before its views are built): the sidebars start to close. */
  const splitTab = foldable && sw.tab === "split";
  // Split: sheet and 3D box side by side, both sidebars hidden. Blinking is always on, in every tab: the panel under the mouse on the sheet (or on the small dieline in the 3D tab) blinks on the 3D box.
  const [hoverPanel, setHoverPanel] = useState<string | null>(null);
  /** Split: share (%) of the width the sheet takes; the divider between the two halves is dragged with the mouse. */
  const [splitPct, setSplitPct] = useState(50);
  const splitBox = useRef<HTMLDivElement>(null);
  const splitDrag = useRef<number | null>(null);
  const setSplitFrom = (clientX: number) => {
    const r = splitBox.current?.getBoundingClientRect();
    if (r && r.width > 0) setSplitPct(Math.min(80, Math.max(20, ((clientX - r.left) / r.width) * 100)));
  };
  const shapes = useMemo(() => (shown ? panelShapes(shown) : []), [shown]);
  const hoverAt = (pt: { x: number; y: number } | null) => {
    const id = pt ? (panelAt(shapes, pt)?.id ?? null) : null;
    setHoverPanel((cur) => (cur === id ? cur : id));
  };
  const blinkId = hoverPanel;
  useEffect(() => {
    viewRef.current?.focusPanel(blinkId);
  }, [blinkId, centre, shown]);
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
    fd.set("windows", windows.length > 0 ? JSON.stringify(windows) : "");
    return fd;
  };

  /** "Save as": the current values become a new project, which then opens. */
  const saveAs = async (newName: string, organize?: { categoryId: string | null; tagIds: string[] }): Promise<{ ok: boolean; message: string | null }> => {
    const fd = formData(mode.kind === "edit" ? mode.projectId : undefined);
    fd.set("name", newName);
    if (organize) {
      fd.set("organized", "1");
      fd.set("categoryId", organize.categoryId ?? "");
      for (const id of organize.tagIds) fd.append("tagId", id);
    }
    const r = await saveProjectAs(fd);
    if (r.ok && r.id) {
      notify.success("Saved as a new project", { description: newName });
      router.push(`/projects/${r.id}`);
      return { ok: true, message: null };
    }
    return { ok: false, message: r.message ?? "Could not save." };
  };

  const download = async () => {
    setBusy(true);
    setDl(null);
    try {
      if (!result.geo) throw new Error("Fix the highlighted values first.");
      if (format === "glb") {
        const glb = await viewRef.current?.exportGlb(watermark ?? null);
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

  // Dieline <-> 3D swap. One 3D box ("stage") stays mounted and glides between its two places: the small card in the right
  // sidebar (Dieline tab) and the centre (3D tab). The dieline is the other way round: it shrinks into the card / grows into the centre.
  const stageHost = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const asideTarget = useRef<HTMLDivElement>(null);
  const centreTarget = useRef<HTMLDivElement>(null);
  const asideSlot = useRef<HTMLDivElement>(null);
  const mainBox = useRef<HTMLElement>(null);
  const swapFrom = useRef<{ aside: DOMRect | null; centre: DOMRect | null } | null>(null);
  const swapNext = useRef(false);
  const stageUntil = useRef(0);
  const stageOn = Boolean(shown && foldable && centre !== "split");
  const placeStage = useCallback(
    (animate: boolean) => {
      const el = stage.current;
      const host = stageHost.current;
      if (!el || !host) return;
      const now = performance.now();
      if (!animate && now < stageUntil.current) return; // a swap is moving it right now
      const target = (centre === "3d" ? centreTarget : asideTarget).current;
      const r = target?.getBoundingClientRect();
      if (!r || r.width < 1 || r.height < 1 || bodyHidden) {
        el.style.visibility = "hidden";
        return;
      }
      const h = host.getBoundingClientRect();
      const move = animate && el.dataset.placed === "1";
      el.style.transition = move ? ["left", "top", "width", "height"].map((k) => `${k} ${SWAP_MS}ms ${SWAP_EASE}`).join(", ") : "none";
      if (move) stageUntil.current = now + SWAP_MS + 60;
      el.style.left = `${r.left - h.left}px`;
      el.style.top = `${r.top - h.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      el.style.visibility = "visible";
      el.dataset.placed = "1";
    },
    [centre, bodyHidden],
  );
  useLayoutEffect(() => {
    if (!stageOn) return;
    const animate = swapNext.current;
    swapNext.current = false;
    placeStage(animate);
  }, [stageOn, centre, placeStage]);
  useEffect(() => {
    if (!stageOn) return;
    const host = stageHost.current;
    if (!host) return;
    const again = () => placeStage(false);
    const ro = new ResizeObserver(again);
    ro.observe(host);
    const target = (centre === "3d" ? centreTarget : asideTarget).current;
    if (target) ro.observe(target);
    window.addEventListener("resize", again);
    host.addEventListener("scroll", again, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", again);
      host.removeEventListener("scroll", again, true);
    };
  }, [stageOn, centre, placeStage]);
  // While the sidebars slide (Split), the stage's card slides with them.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      placeStage(false);
      if (performance.now() - t0 < SIDEBAR_MS + 120) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [splitTab, placeStage]);
  /** Choose a tab. Between Dieline and 3D the old places are noted first, so the views can glide from them. */
  const pickTab = (id: "dieline" | "3d" | "split") => {
    setHoverPanel(null);
    if (id === "split") splitFlags.current = { sheet: false, box: false };
    if (id !== sw.tab && id !== "split" && sw.tab !== "split" && !sw.switching) {
      swapFrom.current = { aside: asideSlot.current?.getBoundingClientRect() ?? null, centre: mainBox.current?.getBoundingClientRect() ?? null };
      swapNext.current = true;
    } else swapFrom.current = null;
    if (id !== sw.tab && !sw.switching) window.history.replaceState(window.history.state, "", withViewTab(window.location.href, id)); // a reload opens the same tab
    sw.select(id);
  };
  const quickPair = sw.tab !== "split" && sw.mounted !== "split";
  // Split has two halves that load at different times: the placeholder goes only when both are drawn (then fades as one).
  const splitFlags = useRef({ sheet: false, box: false });
  const splitDone = (half: "sheet" | "box") => {
    splitFlags.current[half] = true;
    if (splitFlags.current.sheet && splitFlags.current.box) sw.markReady();
  };
  // Dieline | 3D | Split: what the centre shows. In the header's middle on wide screens, over the canvas on small ones.
  const viewTabs = (
    <div role="tablist" aria-label="What to show" aria-busy={sw.switching} className="flex rounded-lg border bg-background/90 p-0.5 text-xs shadow-xs backdrop-blur">
      {([["dieline", "Dieline"], ["3d", "3D"], ["split", "Split"]] as const).map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={sw.tab === id}
          disabled={sw.switching}
          onClick={() => pickTab(id)}
          className={`rounded-md px-3 py-1 font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${sw.tab === id ? "bg-primary text-primary-foreground disabled:text-primary-foreground" : "text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground disabled:text-muted-foreground"} ${sw.switching ? "cursor-wait" : ""}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
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
        <input type="hidden" name="windows" value={windows.length > 0 ? JSON.stringify(windows) : ""} />
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
        onSaveAs={saveAs}
        saveOptions={saveOptions}
        viewer={viewer}
        {...(shown && foldable && !editingWindows ? { centre: viewTabs } : {})}
      />

      {issueText ? (
        <div role={issueOk ? "status" : "alert"} className={`border-b px-4 py-2 text-sm ${issueOk ? "text-green-700" : "bg-destructive/10 text-destructive"}`}>
          {issueText}
        </div>
      ) : null}

      <div ref={stageHost} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {stageOn && shown ? (
        <div ref={stage} style={{ position: "absolute", visibility: "hidden", left: 0, top: 0, width: 0, height: 0 }} className="z-20 flex flex-col" inert={windowsView === "open"}>
          <FoldPreview large onReady={sw.markReady} materialId={materialType?.id} thickness={bt ?? 0} watermark={watermark ?? null} initialView={initialView} geo={shown} progress={progress} onProgress={setProgress} color={boardColor} viewRef={viewRef} />
        </div>
      ) : null}
      <div
        inert={windowsView === "open"}
        // Wide screens: the side columns shrink to nothing when "Split" is chosen and grow back when it is left (the sidebars stay mounted, clipped).
        style={{ "--col-l": splitTab ? "0px" : "372px", "--col-r": splitTab ? "0px" : "340px" } as React.CSSProperties}
        className={`flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[var(--col-l)_minmax(0,1fr)_var(--col-r)] lg:transition-[grid-template-columns] lg:duration-500 lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${bodyHidden ? "hidden" : ""}`}
      >
        {/* Left: vertical menu (Dielines, Basic, Info, More) and the panel of the chosen one */}
        <aside inert={splitTab} className={`min-h-0 min-w-0 overflow-hidden lg:flex lg:justify-end ${splitTab ? "max-lg:hidden" : ""}`}>
          {/* Anchored to the right edge of its column: as the column closes, the sidebar slides out to the left. */}
          <div className={`flex h-full min-h-0 flex-col border-b transition-opacity duration-300 lg:w-[372px] lg:shrink-0 lg:flex-row lg:border-r lg:border-b-0 ${splitTab ? "opacity-0" : ""}`}>
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
              <TemplatePicker currentId={mode.kind === "create" ? mode.presetId : ""} currentProjectId={mode.kind === "edit" ? mode.projectId : null} mode={mode.kind} />
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
                      sizeMode={typeof resolved.sizeMode === "string" ? resolved.sizeMode : "manufacture"}
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
          </div>
        </aside>

        {/* Centre: the sheet, or the 3D box filling the same space. The tabs sit in the top right corner. */}
        <main ref={mainBox} className="relative flex min-h-[55vh] min-w-0 flex-col lg:min-h-0">
          {/* Small screens: the tabs stay here; from lg up they are in the middle of the header. */}
          {shown && foldable ? <div className="absolute top-3 right-4 z-20 lg:hidden">{viewTabs}</div> : null}
          {shown && foldable && centre === "split" ? (
            <div ref={splitBox} style={{ "--split": `${splitPct}%` } as React.CSSProperties} className="flex min-h-0 flex-1 flex-col max-lg:pt-14 lg:flex-row">
              <div className="relative flex min-h-[40vh] min-w-0 flex-1 basis-0 flex-col lg:min-h-0 lg:flex-none lg:basis-(--split)">
                {src ? (
                  <SheetCanvas onReady={() => splitDone("sheet")} onWindows={openWindows} windowCount={windows.length} {...(watermark === undefined ? {} : { watermark: watermark?.text ?? "" })} {...(watermark ? { watermarkStyle: watermark } : {})} bounds={dielineViewBox(shown, 22)} watermarkClip={shown.cutLoops.map(outlinePathD).join(" ")} src={src} toggles={toggles} toggleDefs={toggleDefs} onToggles={setToggles} legend={legend} onHoverMm={hoverAt} highlight={shapes.find((q) => q.id === blinkId)?.poly ?? null} />
                ) : null}
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to resize the dieline and the 3D view (double click to reset)"
                aria-valuemin={20}
                aria-valuemax={80}
                aria-valuenow={Math.round(splitPct)}
                tabIndex={0}
                title="Drag to resize (double click: 50/50)"
                className="group relative z-10 hidden w-0 shrink-0 cursor-col-resize touch-none outline-none lg:block"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  splitDrag.current = e.pointerId;
                  e.preventDefault();
                }}
                onPointerMove={(e) => {
                  if (splitDrag.current === e.pointerId) setSplitFrom(e.clientX);
                }}
                onPointerUp={() => (splitDrag.current = null)}
                onPointerCancel={() => (splitDrag.current = null)}
                onDoubleClick={() => setSplitPct(50)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 10 : 2;
                  if (e.key === "ArrowLeft") setSplitPct((v) => Math.max(20, v - step));
                  else if (e.key === "ArrowRight") setSplitPct((v) => Math.min(80, v + step));
                  else if (e.key === "Home") setSplitPct(50);
                  else return;
                  e.preventDefault();
                }}
              >
                {/* A wide invisible grab area around a thin line; the line turns blue on hover, focus and while dragging. */}
                <span aria-hidden className="absolute inset-y-0 -left-2 w-4" />
                <span aria-hidden className="absolute inset-y-0 left-[-1px] w-0.5 bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
                <span aria-hidden className="absolute top-1/2 left-0 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background shadow-sm group-hover:border-primary" />
              </div>
              <div className="flex min-h-[40vh] min-w-0 flex-1 basis-0 flex-col gap-2 p-4 lg:min-h-0">
                <FoldPreview large onReady={() => splitDone("box")} materialId={materialType?.id} thickness={bt ?? 0} watermark={watermark ?? null} initialView={initialView} geo={shown} progress={progress} onProgress={setProgress} color={boardColor} viewRef={viewRef} />
              </div>
            </div>
          ) : shown && foldable && centre === "3d" ? (
            <div className="flex min-h-0 flex-1 flex-col p-4 max-lg:pt-16">
              <div ref={centreTarget} className="min-h-0 flex-1" />
            </div>
          ) : shown && src ? (
            <SwapIn className="flex min-h-0 flex-1 flex-col" getFrom={() => swapFrom.current?.aside}>
              <SheetCanvas onWindows={openWindows} windowCount={windows.length} {...(watermark === undefined ? {} : { watermark: watermark?.text ?? "" })} {...(watermark ? { watermarkStyle: watermark } : {})} bounds={dielineViewBox(shown, 22)} watermarkClip={shown.cutLoops.map(outlinePathD).join(" ")} src={src} toggles={toggles} toggleDefs={toggleDefs} onToggles={setToggles} legend={legend} onHoverMm={hoverAt} highlight={shapes.find((q) => q.id === blinkId)?.poly ?? null} />
            </SwapIn>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Enter valid dimensions to see the dieline.</p>
          )}
          {!result.geo && shown ? <p role="status" className="border-t px-4 py-1.5 text-xs text-destructive">Showing the last valid shape.</p> : null}
          <SkeletonOverlay show={sw.switching && !quickPair} tab={sw.tab} pct={splitPct} />
        </main>

        {/* Right: 3D + file formats */}
        <aside inert={splitTab} className={`min-h-0 min-w-0 overflow-hidden ${splitTab ? "max-lg:hidden" : ""}`}>
          {/* Anchored to the left edge of its column: as the column closes, the sidebar slides out to the right. */}
          <div className={`flex h-full min-h-0 flex-col gap-4 overflow-y-auto border-t p-4 transition-opacity duration-300 lg:w-[340px] lg:border-t-0 lg:border-l ${splitTab ? "opacity-0" : ""}`}>
          {shown && foldable ? (
            // Dieline tab: the small 3D card. 3D tab: the dieline takes its place here (a click brings it back to the centre).
            <div ref={asideSlot} className="relative shrink-0 rounded-2xl">
              {centre === "dieline" ? <div ref={asideTarget} className="h-[17rem]" /> : src ? (
                <SwapIn getFrom={() => swapFrom.current?.centre}>
                  <MiniSheet box={dielineViewBox(shown, 22)} src={src} onOpen={() => pickTab("dieline")} onHoverMm={hoverAt} highlight={shapes.find((q) => q.id === blinkId)?.poly ?? null} />
                </SwapIn>
              ) : <div className="h-80" aria-hidden />}
              {sw.switching && !quickPair && sw.tab === "dieline" ? <ViewSkeleton kind="box" label="Loading the 3D preview" /> : null}
            </div>
          ) : null}
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
          </div>
        </aside>
      </div>
      {windowsView !== "closed" && base ? (
        <div className={`absolute inset-0 z-30 flex flex-col bg-background ${windowsView === "closing" ? "wh-exit" : "wh-enter"}`}>
          <WindowEditor
            geo={base}
            value={windows}
            unit={unit}
            onUnit={setUnit}
            onCancel={closeWindows}
            onDone={(next) => {
              setWindows(next);
              closeWindows();
            }}
            materialId={materialType?.id}
            boardColor={boardColor}
            thickness={bt ?? 0}
            watermark={watermark ?? null}
          />
        </div>
      ) : null}
      </div>
    </div>
  );
}
