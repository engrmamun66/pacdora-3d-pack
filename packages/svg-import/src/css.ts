import type { XmlNode } from "./xml";

/** Properties the importer cares about; everything else in a style attribute or rule is dropped early. */
export const PROPS = new Set([
  "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "fill", "fill-opacity",
  "display", "visibility", "opacity",
]);

type Decls = Record<string, string>;

const MAX_RULES = 20_000;

/** Parses "a:b; c:d" into the properties we use. */
export function parseDecls(text: string, into: Decls): void {
  let i = 0;
  const n = text.length;
  while (i < n) {
    let e = text.indexOf(";", i);
    if (e < 0) e = n;
    const colon = text.indexOf(":", i);
    if (colon >= 0 && colon < e) {
      const name = text.slice(i, colon).trim().toLowerCase();
      if (PROPS.has(name)) {
        let value = text.slice(colon + 1, e).trim();
        const bang = value.indexOf("!");
        if (bang >= 0) value = value.slice(0, bang).trim();
        if (value.toLowerCase() === "inherit") delete into[name];
        else if (value) into[name] = value;
      }
    }
    i = e + 1;
  }
}

interface Rule {
  tag: string;
  id: string;
  classes: string[];
  spec: number;
  order: number;
  decls: Decls;
}

const SELECTOR_RE = /^(\*|[A-Za-z_][\w:-]*)?((?:[.#][\w-]+)*)$/;
const PART_RE = /([.#])([\w-]+)/g;

/** Rules indexed by their most specific part so lookups stay cheap on files with thousands of elements. */
export class StyleSheet {
  private byId = new Map<string, Rule[]>();
  private byClass = new Map<string, Rule[]>();
  private byTag = new Map<string, Rule[]>();
  private any: Rule[] = [];
  private order = 0;
  private size = 0;
  unsupported = 0;

  get empty(): boolean {
    return this.size === 0;
  }

  add(css: string): void {
    // strip comments linearly (a regex here is quadratic on hostile input)
    let text = "";
    let i = 0;
    for (;;) {
      const s = css.indexOf("/*", i);
      if (s < 0) {
        text += css.slice(i);
        break;
      }
      text += css.slice(i, s);
      const e = css.indexOf("*/", s + 2);
      if (e < 0) break;
      i = e + 2;
    }
    const n = text.length;
    i = 0;
    while (i < n) {
      while (i < n && /\s/.test(text[i]!)) i++;
      if (i >= n) break;
      if (text[i] === "@") {
        this.unsupported++;
        const semi = text.indexOf(";", i);
        const open = text.indexOf("{", i);
        if (open < 0 || (semi >= 0 && semi < open)) {
          i = semi < 0 ? n : semi + 1;
          continue;
        }
        let depth = 0;
        let j = open;
        for (; j < n; j++) {
          const c = text[j];
          if (c === "{") depth++;
          else if (c === "}" && --depth === 0) break;
        }
        i = j + 1;
        continue;
      }
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const close = text.indexOf("}", open);
      const selectorText = text.slice(i, open);
      const body = text.slice(open + 1, close < 0 ? n : close);
      i = close < 0 ? n : close + 1;
      const decls: Decls = Object.create(null);
      parseDecls(body, decls);
      for (const raw of selectorText.split(",")) this.addRule(raw.trim(), decls);
    }
  }

  private addRule(sel: string, decls: Decls): void {
    if (!sel) return;
    const m = SELECTOR_RE.exec(sel);
    if (!m) {
      this.unsupported++;
      return;
    }
    if (this.size >= MAX_RULES) return;
    const tag = m[1] && m[1] !== "*" ? m[1] : "";
    const classes: string[] = [];
    let id = "";
    for (const p of m[2]!.matchAll(PART_RE)) {
      if (p[1] === "#") id = p[2]!;
      else classes.push(p[2]!);
    }
    const rule: Rule = { tag, id, classes, spec: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0), order: this.order++, decls };
    this.size++;
    const push = (map: Map<string, Rule[]>, key: string) => {
      const l = map.get(key);
      if (l) l.push(rule);
      else map.set(key, [rule]);
    };
    if (id) push(this.byId, id);
    else if (classes.length) push(this.byClass, classes[0]!);
    else if (tag) push(this.byTag, tag);
    else this.any.push(rule);
  }

  /** Declarations from matching rules, lowest precedence first applied. */
  match(node: XmlNode, into: Decls): void {
    if (this.size === 0) return;
    const hits: Rule[] = [];
    const id = node.attrs.id;
    const cls = node.attrs.class;
    const classList = cls ? cls.split(/\s+/).filter(Boolean) : [];
    const test = (r: Rule) => {
      if (r.tag && r.tag !== node.name) return;
      if (r.id && r.id !== id) return;
      for (const c of r.classes) if (!classList.includes(c)) return;
      hits.push(r);
    };
    for (const r of this.any) test(r);
    for (const r of this.byTag.get(node.name) ?? []) test(r);
    for (const c of classList) for (const r of this.byClass.get(c) ?? []) test(r);
    if (id !== undefined) for (const r of this.byId.get(id) ?? []) test(r);
    if (hits.length > 1) {
      // a rule indexed under its first class can be reached once per matching class
      const uniq = [...new Set(hits)];
      uniq.sort((a, b) => a.spec - b.spec || a.order - b.order);
      for (const r of uniq) Object.assign(into, r.decls);
    } else if (hits.length === 1) {
      Object.assign(into, hits[0]!.decls);
    }
  }
}
