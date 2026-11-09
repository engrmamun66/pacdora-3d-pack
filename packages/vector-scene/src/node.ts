import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ArtworkFont } from "@packaging/schema";
import type { FontSource } from "./build";

/**
 * Folder of an @fontsource package, found at run time by walking up from the
 * working directory (works in the monorepo, in the Next.js server and in
 * production installs; bundlers cannot rewrite it). FONT_PACKAGES_DIR overrides.
 */
function packageDir(family: ArtworkFont): string {
  const name = `@fontsource/${slug(family)}`;
  const override = process.env.FONT_PACKAGES_DIR;
  if (override) return path.join(override, name);
  let dir = /* turbopackIgnore: true */ process.cwd();
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Font package ${name} not found (set FONT_PACKAGES_DIR).`);
    dir = parent;
  }
}

const slug = (f: ArtworkFont) => f.toLowerCase().replace(/ /g, "-");

/**
 * Fonts from the @fontsource packages (latin subset, WOFF): the same files the
 * editor shows, so outlines match the screen. Missing styles fall back to
 * upright (reported as inexact).
 */
export const nodeFontSource: FontSource = {
  async load(family, weight, style) {
    const dir = packageDir(family);
    const w = weight === "bold" ? 700 : 400;
    const tryLoad = async (st: string) => {
      try {
        return await readFile(path.join(dir, "files", `${slug(family)}-latin-${w}-${st}.woff`));
      } catch {
        return null;
      }
    };
    const exactBytes = await tryLoad(style);
    if (exactBytes) return { bytes: new Uint8Array(exactBytes), exact: true };
    const fallback = await tryLoad("normal");
    if (!fallback) throw new Error(`Font file for ${family} ${w} not found.`);
    return { bytes: new Uint8Array(fallback), exact: false };
  },
};
