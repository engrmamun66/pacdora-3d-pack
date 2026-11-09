import { SvgImportError } from "./types";

/**
 * Small tolerant XML tokenizer. It builds just enough tree for SVG and never
 * expands entities: DOCTYPE / ENTITY declarations are skipped wholesale and
 * only the five predefined and numeric references are decoded.
 */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Only filled for <style> elements. */
  text: string;
}

export interface XmlDoc {
  root: XmlNode | null;
  ids: Map<string, XmlNode>;
  styleTexts: string[];
  tagCounts: Map<string, number>;
}

export const MAX_DEPTH = 64;
export const MAX_ELEMENTS = 50_000;

const ENTITY_RE = /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos);/g;

function decodeEntities(s: string): string {
  if (s.indexOf("&") < 0) return s;
  return s.replace(ENTITY_RE, (_m, body: string) => {
    switch (body) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
    }
    const code = body.charCodeAt(1) === 120 || body.charCodeAt(1) === 88 ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!(code > 0) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
    return String.fromCodePoint(code);
  });
}

const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12;

function normName(raw: string): string {
  return raw.startsWith("svg:") ? raw.slice(4) : raw;
}

/** Skips <!DOCTYPE ...> including an internal subset; quotes and comments inside can hide '>'. */
function skipDeclaration(src: string, start: number): number {
  const n = src.length;
  let i = start + 2;
  let depth = 0;
  let quote = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (quote) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) {
      quote = c;
    } else if (c === 60 && src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      if (e < 0) return n;
      i = e + 2;
    } else if (c === 91) {
      depth++;
    } else if (c === 93) {
      depth--;
    } else if (c === 62 && depth <= 0) {
      return i + 1;
    }
    i++;
  }
  return n;
}

export function parseXml(src: string): XmlDoc {
  const n = src.length;
  const stack: XmlNode[] = [];
  const ids = new Map<string, XmlNode>();
  const styleTexts: string[] = [];
  const tagCounts = new Map<string, number>();
  let root: XmlNode | null = null;
  let count = 0;
  let i = 0;

  while (i < n) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      if (top && top.name === "style") top.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i && top && top.name === "style") top.text += decodeEntities(src.slice(i, lt));
    i = lt;
    const c1 = src.charCodeAt(i + 1);

    if (c1 === 33) {
      if (src.startsWith("<!--", i)) {
        const e = src.indexOf("-->", i + 4);
        i = e < 0 ? n : e + 3;
      } else if (src.startsWith("<![CDATA[", i)) {
        const e = src.indexOf("]]>", i + 9);
        if (top && top.name === "style") top.text += src.slice(i + 9, e < 0 ? n : e);
        i = e < 0 ? n : e + 3;
      } else {
        i = skipDeclaration(src, i);
      }
      continue;
    }
    if (c1 === 63) {
      const e = src.indexOf("?>", i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c1 === 47) {
      const e = src.indexOf(">", i + 2);
      if (e < 0) break;
      const name = normName(src.slice(i + 2, e).trim());
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      i = e + 1;
      if (stack.length === 0 && root) break;
      continue;
    }

    // start tag
    let j = i + 1;
    while (j < n) {
      const c = src.charCodeAt(j);
      if (isWs(c) || c === 47 || c === 62) break;
      j++;
    }
    if (j === i + 1) {
      i++; // a stray '<' is just text
      continue;
    }
    const name = normName(src.slice(i + 1, j));
    const attrs: Record<string, string> = Object.create(null);
    let selfClose = false;
    for (;;) {
      while (j < n && isWs(src.charCodeAt(j))) j++;
      if (j >= n) break;
      const c = src.charCodeAt(j);
      if (c === 62) {
        j++;
        break;
      }
      if (c === 47) {
        selfClose = true;
        j++;
        continue;
      }
      selfClose = false;
      const ns = j;
      while (j < n) {
        const d = src.charCodeAt(j);
        if (isWs(d) || d === 61 || d === 62 || d === 47) break;
        j++;
      }
      const attrName = src.slice(ns, j);
      while (j < n && isWs(src.charCodeAt(j))) j++;
      let value = "";
      if (src.charCodeAt(j) === 61) {
        j++;
        while (j < n && isWs(src.charCodeAt(j))) j++;
        const q = src.charCodeAt(j);
        if (q === 34 || q === 39) {
          const e = src.indexOf(q === 34 ? '"' : "'", j + 1);
          const end = e < 0 ? n : e;
          value = src.slice(j + 1, end);
          j = e < 0 ? n : e + 1;
        } else {
          const vs = j;
          while (j < n && !isWs(src.charCodeAt(j)) && src.charCodeAt(j) !== 62) j++;
          value = src.slice(vs, j);
        }
      }
      if (attrName) attrs[attrName] = decodeEntities(value);
    }

    if (++count > MAX_ELEMENTS) throw new SvgImportError(`This SVG has too many elements (more than ${MAX_ELEMENTS.toLocaleString("en-US")}).`);
    if (stack.length + 1 > MAX_DEPTH) throw new SvgImportError(`This SVG is nested too deeply (more than ${MAX_DEPTH} levels).`);
    const node: XmlNode = { name, attrs, children: [], text: "" };
    tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
    const id = attrs.id;
    if (id !== undefined && !ids.has(id)) ids.set(id, node);
    if (top) top.children.push(node);
    else if (!root) {
      root = node;
      if (name !== "svg") break; // not an SVG; no point reading the rest
    } else break;
    if (!selfClose) stack.push(node);
    else if (stack.length === 0) break;
    i = j;
  }

  // style text is accumulated on the node (it may arrive in several chunks); gather it now
  if (root) {
    const todo: XmlNode[] = [root];
    while (todo.length) {
      const nd = todo.pop()!;
      if (nd.name === "style") styleTexts.push(nd.text);
      for (const ch of nd.children) todo.push(ch);
    }
  }
  return { root, ids, styleTexts, tagCounts };
}
