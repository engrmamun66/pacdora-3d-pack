import { parseColor } from "./color";
import { PROPS, StyleSheet, parseDecls } from "./css";
import {
  Budget, Sink, areaScale, ellipseShape, flattenPath, mul, parseNumberList, parsePoints, parseTransform,
  rectShape, scaleM, translateM, lastScanEnd, scanNumber,
  type Mat,
} from "./geometry";
import { assignRoles } from "./roles";
import { MAX_DEPTH, parseXml, type XmlNode } from "./xml";
import { SvgImportError, type ImportOptions, type ImportReport, type ImportedDieline, type ImportedPath, type SvgStyle } from "./types";

export const MAX_TEXT_CHARS = 3_000_000;
const MAX_VISITS = 250_000;
const MAX_USE_DEPTH = 16;
const MAX_WALK_DEPTH = 512;
const MIN_SIZE_MM = 1;
const MAX_SIZE_MM = 20_000;

type Unit = "mm" | "cm" | "in" | "pt" | "px";
const MM_PER: Record<"mm" | "cm" | "in" | "pt" | "pc", number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
/** CSS lengths expressed in user units (CSS px) for stroke-width and friends. */
const USER_PER: Record<string, number> = { "": 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16, em: 16, ex: 8 };

/** Elements whose children are never drawn directly. */
const NOT_DRAWN = new Set([
  "defs", "clipPath", "mask", "pattern", "marker", "metadata", "title", "desc", "style", "script",
  "linearGradient", "radialGradient", "filter", "symbol",
]);
const CONTAINERS = new Set(["g", "a", "switch", "svg"]);
const SHAPES = new Set(["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"]);
/** Drawn element kinds we skip but tell the user about. */
const IGNORED_DRAWN = ["text", "image", "foreignObject"];
const IGNORED_DEFINED = ["linearGradient", "radialGradient", "filter"];
const IGNORED_LABEL: Record<string, [string, string]> = {
  text: ["Text", "was"],
  image: ["Images", "were"],
  foreignObject: ["Embedded HTML (foreignObject)", "was"],
  linearGradient: ["Gradients", "were"],
  radialGradient: ["Gradients", "were"],
  filter: ["Filters", "were"],
};

interface Inherited {
  stroke: string | null;
  strokeWidth: number; // user units
  dashed: boolean;
  fill: string | null;
  visible: boolean;
  strokeOpacity: number;
  fillOpacity: number;
}

const ROOT_STYLE: Inherited = { stroke: null, strokeWidth: 1, dashed: false, fill: "000000", visible: true, strokeOpacity: 1, fillOpacity: 1 };

interface RawPath {
  pts: number[];
  closed: boolean;
  color: string;
  dashed: boolean;
  widthMm: number;
}

interface Size { value: number; unit: string }

/** "12.5mm" -> {12.5,"mm"}; null for percentages, missing or malformed values. */
function parseSize(s: string | undefined): Size | null {
  if (!s) return null;
  const t = s.trim();
  const v = scanNumber(t, 0);
  if (Number.isNaN(v)) return null;
  const unit = t.slice(lastScanEnd()).trim().toLowerCase();
  if (unit === "%" || !(unit in USER_PER)) return null;
  return { value: v, unit };
}

/** Length in user units (for geometry attributes); NaN when absent or unusable. */
function userLen(s: string | undefined): number {
  const z = parseSize(s);
  return z ? z.value * USER_PER[z.unit]! : NaN;
}

function parseDash(v: string): boolean {
  const t = v.trim().toLowerCase();
  if (!t || t === "none") return false;
  const parts = t.split(/[\s,]+/).filter(Boolean);
  return parts.some((p) => parseFloat(p) !== 0);
}

function parseOpacity(v: string | undefined): number {
  if (v === undefined) return NaN;
  const t = v.trim();
  const x = parseFloat(t);
  if (!Number.isFinite(x)) return NaN;
  return Math.max(0, Math.min(1, t.endsWith("%") ? x / 100 : x));
}

function ignoredWarning(name: string, count: number): string {
  const [label, verb] = IGNORED_LABEL[name] ?? [`<${name}> elements`, "were"];
  return `${label} ${verb} ignored (${count} element${count === 1 ? "" : "s"}).`;
}

const round = (v: number, p: number) => Math.round(v * p) / p;

export function importSvg(text: string, opts: ImportOptions = {}): ImportedDieline {
  if (typeof text !== "string") throw new SvgImportError("This file is not an SVG.");
  if (text.length > MAX_TEXT_CHARS) throw new SvgImportError(`This SVG file is too large (more than ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters).`);
  const pxPerInch = opts.pxPerInch ?? 96;
  const userScale = opts.scale ?? 1;
  if (!(pxPerInch > 0) || !Number.isFinite(pxPerInch)) throw new SvgImportError("Pixels per inch must be a positive number.");
  if (!(userScale > 0) || !Number.isFinite(userScale)) throw new SvgImportError("Scale must be a positive number.");

  const doc = parseXml(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const root = doc.root;
  if (!root || root.name !== "svg") throw new SvgImportError("This file is not an SVG.");

  const warnings: string[] = [];
  const ignored: Record<string, number> = Object.create(null);
  const bump = (name: string) => {
    ignored[name] = (ignored[name] ?? 0) + 1;
  };
  for (const name of IGNORED_DEFINED) {
    const c = doc.tagCounts.get(name);
    if (c) ignored[name] = c;
  }

  // ---- unit / size resolution ----
  const mmPerUnit = (u: Unit) => (u === "px" ? 25.4 / pxPerInch : MM_PER[u]);
  const wAttr = parseSize(root.attrs.width);
  const hAttr = parseSize(root.attrs.height);
  // "px" only counts as a real-world size when the caller did not pick another unit explicitly
  const isReal = (z: Size | null): z is Size => {
    if (!z || z.unit === "" || z.unit === "em" || z.unit === "ex") return false;
    return z.unit !== "px" || !opts.unit || opts.unit === "auto" || opts.unit === "px";
  };
  const realW = isReal(wAttr) ? wAttr : null;
  const realH = isReal(hAttr) ? hAttr : null;
  const toMm = (z: Size) => z.value * (z.unit === "px" ? 25.4 / pxPerInch : MM_PER[z.unit as keyof typeof MM_PER]);
  const vbList = root.attrs.viewBox ? parseNumberList(root.attrs.viewBox) : null;
  const vb = vbList && vbList.length === 4 && vbList[2]! > 0 && vbList[3]! > 0 ? vbList : null;

  let unit: ImportReport["unit"];
  let unitSource: ImportReport["unitSource"];
  let mmPerUser: number;
  const realUnit = (realW ?? realH)?.unit;
  if (realW || realH) {
    unitSource = "svg-size";
    unit = realUnit === "pc" ? "pt" : (realUnit as Unit);
    if (vb) {
      const sx = realW ? toMm(realW) / vb[2]! : Infinity;
      const sy = realH ? toMm(realH) / vb[3]! : Infinity;
      mmPerUser = Math.min(sx, sy); // uniform scale, like preserveAspectRatio "meet"
    } else {
      // no viewBox: coordinates are taken to be in the unit the size is written in
      mmPerUser = realUnit === "px" ? 25.4 / pxPerInch : MM_PER[realUnit as keyof typeof MM_PER] ?? 1;
    }
  } else {
    if (opts.unit && opts.unit !== "auto") {
      unit = opts.unit;
      unitSource = "option";
    } else {
      unit = "px";
      unitSource = "assumed";
      warnings.push("The SVG does not state a real-world size, so pixels at 96 dpi were assumed. Check the drawing size and choose the right unit if it looks wrong.");
    }
    let k = mmPerUnit(unit);
    // unitless width/height next to a viewBox rescale user units into that size
    if (vb && wAttr && hAttr && wAttr.unit === "" && hAttr.unit === "") {
      const f = Math.min(wAttr.value / vb[2]!, hAttr.value / vb[3]!);
      if (f > 0 && Number.isFinite(f)) k *= f;
    }
    mmPerUser = k;
  }
  if (!(mmPerUser > 0) || !Number.isFinite(mmPerUser)) mmPerUser = 1;
  mmPerUser *= userScale;
  const baseM = scaleM(mmPerUser, mmPerUser);

  // ---- styles ----
  const sheet = new StyleSheet();
  for (const css of doc.styleTexts) sheet.add(css);
  if (sheet.unsupported > 0) warnings.push("Some CSS selectors or rules in the SVG are not supported and were ignored.");

  const decls = (node: XmlNode): Record<string, string> => {
    const d: Record<string, string> = Object.create(null);
    const a = node.attrs;
    for (const p of PROPS) {
      const v = a[p];
      if (v !== undefined) d[p] = v;
    }
    sheet.match(node, d);
    if (a.style) parseDecls(a.style, d);
    return d;
  };

  const inherit = (d: Record<string, string>, p: Inherited): Inherited => {
    if (!d.stroke && !d["stroke-width"] && !d["stroke-dasharray"] && !d.fill && !d.visibility && !d["stroke-opacity"] && !d["fill-opacity"]) return p;
    let { stroke, strokeWidth, dashed, fill, visible, strokeOpacity, fillOpacity } = p;
    if (d.stroke !== undefined) {
      const c = parseColor(d.stroke);
      if (c !== undefined) stroke = c;
    }
    if (d.fill !== undefined) {
      const c = parseColor(d.fill);
      if (c !== undefined) fill = c;
    }
    if (d["stroke-width"] !== undefined) {
      const w = userLen(d["stroke-width"]);
      if (w >= 0) strokeWidth = w;
    }
    if (d["stroke-dasharray"] !== undefined) dashed = parseDash(d["stroke-dasharray"]);
    if (d.visibility !== undefined) {
      const v = d.visibility.trim().toLowerCase();
      if (v === "hidden" || v === "collapse") visible = false;
      else if (v === "visible") visible = true;
    }
    const so = parseOpacity(d["stroke-opacity"]);
    if (!Number.isNaN(so)) strokeOpacity = so;
    const fo = parseOpacity(d["fill-opacity"]);
    if (!Number.isNaN(fo)) fillOpacity = fo;
    return { stroke, strokeWidth, dashed, fill, visible, strokeOpacity, fillOpacity };
  };

  // ---- walk ----
  const budget = new Budget();
  const raw: RawPath[] = [];
  let visits = 0;
  let shapes = 0;
  let badTransforms = 0;
  let badPaths = 0;
  let externalRefs = 0;
  let useLimit = 0;
  const useStack = new Set<XmlNode>();

  const emitShape = (node: XmlNode, m: Mat, inh: Inherited): void => {
    if (!inh.visible) return;
    const kind = node.name;
    let color: string | null = null;
    let widthMm = 0;
    if (inh.stroke !== null && inh.strokeOpacity > 0) {
      color = inh.stroke;
      widthMm = inh.strokeWidth * areaScale(m);
    } else if (kind !== "line" && inh.fill !== null && inh.fill !== "ffffff" && inh.fillOpacity > 0) {
      // some exporters fill hairline shapes instead of stroking them; keep their outline
      color = inh.fill;
    }
    if (color === null) return;
    const dashed = inh.dashed;
    const c = color;
    const sink = new Sink(m, budget, (pts, closed) => {
      raw.push({ pts, closed, color: c, dashed, widthMm });
    });
    const a = node.attrs;
    switch (kind) {
      case "path":
        if (a.d && !flattenPath(a.d, sink)) badPaths++;
        break;
      case "line": {
        const x1 = userLen(a.x1) || 0, y1 = userLen(a.y1) || 0, x2 = userLen(a.x2) || 0, y2 = userLen(a.y2) || 0;
        sink.moveTo(x1, y1);
        sink.lineTo(x2, y2);
        sink.end();
        break;
      }
      case "polyline":
      case "polygon": {
        const pts = a.points ? parsePoints(a.points) : [];
        if (pts.length >= 4) {
          sink.moveTo(pts[0]!, pts[1]!);
          for (let i = 2; i < pts.length; i += 2) sink.lineTo(pts[i]!, pts[i + 1]!);
          if (kind === "polygon") sink.close();
          else sink.end();
        }
        break;
      }
      case "rect": {
        const w = userLen(a.width), h = userLen(a.height);
        if (w > 0 && h > 0) rectShape(sink, userLen(a.x) || 0, userLen(a.y) || 0, w, h, userLen(a.rx) || 0, userLen(a.ry) || 0);
        break;
      }
      case "circle": {
        const r = userLen(a.r);
        if (r > 0) ellipseShape(sink, userLen(a.cx) || 0, userLen(a.cy) || 0, r, r);
        break;
      }
      case "ellipse": {
        const rx = userLen(a.rx), ry = userLen(a.ry);
        if (rx > 0 && ry > 0) ellipseShape(sink, userLen(a.cx) || 0, userLen(a.cy) || 0, rx, ry);
        break;
      }
    }
    shapes++;
  };

  // mode: 0 normal, 1 document root, 2 referenced through <use> (symbols render)
  const walk = (node: XmlNode, parentM: Mat, parentInh: Inherited, depth: number, mode: 0 | 1 | 2): void => {
    if (++visits > MAX_VISITS) throw new SvgImportError("This SVG is too complex (too many repeated references).");
    if (depth > MAX_WALK_DEPTH) throw new SvgImportError(`This SVG is nested too deeply (more than ${MAX_DEPTH} levels).`);
    const name = node.name;
    if (NOT_DRAWN.has(name) && !(name === "symbol" && mode === 2)) return;
    const isUse = name === "use";
    const isContainer = CONTAINERS.has(name) || name === "symbol";
    const isIgnoredDrawn = IGNORED_DRAWN.includes(name);
    if (!isUse && !isContainer && !SHAPES.has(name) && !isIgnoredDrawn) return;

    const d = decls(node);
    const disp = d.display;
    if (disp !== undefined && disp.trim().toLowerCase() === "none") return;
    if (d.opacity !== undefined && parseOpacity(d.opacity) === 0) return;
    if (isIgnoredDrawn) {
      bump(name);
      return;
    }
    let m = parentM;
    const tr = node.attrs.transform;
    if (tr) {
      const t = parseTransform(tr);
      if (!t) {
        badTransforms++;
        return;
      }
      m = mul(m, t);
    }
    const inh = inherit(d, parentInh);

    if (SHAPES.has(name)) {
      emitShape(node, m, inh);
      return;
    }
    if (isUse) {
      const href = node.attrs.href ?? node.attrs["xlink:href"];
      if (!href || href.charCodeAt(0) !== 35) {
        if (href) externalRefs++;
        return;
      }
      const target = doc.ids.get(href.slice(1));
      if (!target || useStack.has(target)) return;
      if (useStack.size >= MAX_USE_DEPTH) {
        useLimit++;
        return;
      }
      const x = userLen(node.attrs.x) || 0;
      const y = userLen(node.attrs.y) || 0;
      useStack.add(target);
      walk(target, x || y ? mul(m, translateM(x, y)) : m, inh, depth + 1, 2);
      useStack.delete(target);
      return;
    }
    if (name === "svg" && mode !== 1) {
      // nested viewport: translate to x/y and map its viewBox with a uniform scale
      const x = userLen(node.attrs.x) || 0;
      const y = userLen(node.attrs.y) || 0;
      m = mul(m, translateM(x, y));
      const nvb = node.attrs.viewBox ? parseNumberList(node.attrs.viewBox) : null;
      const w = userLen(node.attrs.width), h = userLen(node.attrs.height);
      if (nvb && nvb.length === 4 && nvb[2]! > 0 && nvb[3]! > 0 && w > 0 && h > 0) {
        const s = Math.min(w / nvb[2]!, h / nvb[3]!);
        m = mul(mul(m, scaleM(s, s)), translateM(-nvb[0]!, -nvb[1]!));
      }
    }
    for (const child of node.children) walk(child, m, inh, depth + 1, 0);
  };

  walk(root, baseM, ROOT_STYLE, 1, 1);

  for (const name of IGNORED_DRAWN) {
    const c = ignored[name];
    if (c) warnings.push(ignoredWarning(name, c));
  }
  const grads = (ignored.linearGradient ?? 0) + (ignored.radialGradient ?? 0);
  if (grads) warnings.push(ignoredWarning("linearGradient", grads));
  if (ignored.filter) warnings.push(ignoredWarning("filter", ignored.filter));
  if (badTransforms) warnings.push(`${badTransforms} element${badTransforms === 1 ? "" : "s"} with an invalid transform ${badTransforms === 1 ? "was" : "were"} skipped.`);
  if (badPaths) warnings.push(`${badPaths} path${badPaths === 1 ? " has" : "s have"} malformed data; only the part before the error was used.`);
  if (budget.nonFinite) warnings.push(`${budget.nonFinite} shape${budget.nonFinite === 1 ? "" : "s"} with invalid or out-of-range numbers ${budget.nonFinite === 1 ? "was" : "were"} skipped.`);
  if (externalRefs) warnings.push("External references (other files or URLs) are never followed and were ignored.");
  if (useLimit) warnings.push("Some <use> references were nested too deeply and were skipped.");

  if (raw.length === 0) throw new SvgImportError("No lines or shapes were found in this SVG.");

  // ---- normalise to the origin ----
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of raw) {
    const pts = p.pts;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i]!, y = pts[i + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const widthMm = round(maxX - minX, 1e6);
  const heightMm = round(maxY - minY, 1e6);
  if (!(widthMm >= MIN_SIZE_MM && widthMm <= MAX_SIZE_MM && heightMm >= MIN_SIZE_MM && heightMm <= MAX_SIZE_MM)) {
    throw new SvgImportError(
      `The drawing is ${round(widthMm, 100)} x ${round(heightMm, 100)} mm, outside the supported ${MIN_SIZE_MM}-${MAX_SIZE_MM} mm range. Check the unit or scale setting.`,
    );
  }

  // ---- group into styles ----
  interface Acc { key: string; stroke: string; dashed: boolean; width: number; count: number; length: number }
  const accs = new Map<string, Acc>();
  const paths: ImportedPath[] = [];
  let pointCount = 0;
  for (const p of raw) {
    const pts = p.pts;
    let len = 0;
    for (let i = 0; i < pts.length; i += 2) {
      pts[i] = round(pts[i]! - minX, 1e6);
      pts[i + 1] = round(pts[i + 1]! - minY, 1e6);
      if (i >= 2) len += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
    }
    if (p.closed) len += Math.hypot(pts[0]! - pts[pts.length - 2]!, pts[1]! - pts[pts.length - 1]!);
    const width = Number((Math.round(p.widthMm / 0.05) * 0.05).toFixed(2));
    const key = `${p.color}|${p.dashed ? "d" : "s"}|${width}`;
    let acc = accs.get(key);
    if (!acc) {
      acc = { key, stroke: p.color, dashed: p.dashed, width, count: 0, length: 0 };
      accs.set(key, acc);
    }
    acc.count++;
    acc.length += len;
    pointCount += pts.length / 2;
    paths.push({ style: key, closed: p.closed, pts });
  }
  const list = [...accs.values()].sort((a, b) => b.count - a.count || b.length - a.length || (a.key < b.key ? -1 : 1));
  const roles = assignRoles(list.map((a) => ({ key: a.key, color: a.stroke, dashed: a.dashed, length: a.length })));
  const styles: SvgStyle[] = list.map((a) => ({
    key: a.key,
    stroke: `#${a.stroke}`,
    dashed: a.dashed,
    strokeWidthMm: a.width,
    count: a.count,
    suggestedRole: roles.get(a.key) ?? "guide",
  }));

  const ignoredOut: Record<string, number> = {};
  for (const [k, v] of Object.entries(ignored)) if (k !== "linearGradient" && k !== "radialGradient") ignoredOut[k] = v;
  if (grads) ignoredOut.gradient = grads;

  return {
    widthMm,
    heightMm,
    styles,
    paths,
    report: { unit, unitSource, warnings, ignored: ignoredOut, elementCount: shapes, pointCount },
  };
}
