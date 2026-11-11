---
name: screenshot-to-svg
description: Recreate a screenshot or image (UI, icon, logo, diagram, line drawing, dieline sketch) as a clean, hand-built SVG file. Use when the user gives an image path or pastes a screenshot and asks to "make an SVG", "vectorize", "trace" or "convert this screenshot to SVG".
---

# Screenshot to SVG

Rebuild what the image shows as real vector shapes (rect, circle, path, text), not an embedded bitmap. Never wrap the PNG in `<image>` or base64 and call it done.

## 0. Check the source first

- Only work from images the user owns or has the right to use (their own screenshots, designs, sketches, standard shapes).
- This project must not copy Pacdora content: do not vectorize Pacdora dielines, catalog previews or branding, even from a screenshot. Pacdora is UX inspiration only. If the image looks like one, stop and say so; offer to build the shape from public standards (FEFCO/ECMA) with the dieline engine instead.
- Brand logos and trademarks: reproduce only if the user says it is theirs.

## 1. Ask for the file name (always, before creating any SVG)

Before writing the SVG, ask the user what to name the file. Do not guess, and do not start building until they answer.
- Ask in one short question, e.g. "What file name for the SVG?" (AskUserQuestion with a suggested name from the image, e.g. `login-form`, plus "Other", or a plain question).
- Accept the name with or without `.svg`. Make it safe: lowercase letters, digits, `-` and `_` only (turn spaces into `-`), no slashes or `..`, then add `.svg`.
- If `assets/svg/<name>.svg` already exists, tell the user and ask: overwrite, or another name. Never overwrite silently.
- Doing a first read of the image to suggest a name is fine. Only the build waits for the answer.

## 2. Look and plan

1. Read the image with the Read tool (absolute path). If it is huge, also crop/scale a copy to inspect details (see "Tools").
2. Note the pixel size (width x height). Use it as the SVG `viewBox` (`0 0 W H`) so coordinates match the image 1:1. Keep `width`/`height` equal to the image size unless the user asks otherwise.
3. List the layers back to front: background, big shapes, panels/cards, lines, icons, text. Build in that order.
4. Sample colours: read hex values from the image (use a tool, see below, or estimate carefully). Define repeated colours once, as CSS variables or `<defs>` classes.

## 3. Build the SVG

- Prefer simple primitives: `rect` (with `rx`), `circle`, `ellipse`, `line`, `polyline`, `polygon`. Use `path` for anything else.
- Keep numbers tidy: integers or 1 decimal; round coordinates to the pixel grid for UI, to 0.01 for curves.
- Text: use `<text>` with a generic font stack (`font-family="Inter, system-ui, sans-serif"`), real font size/weight/`fill`, `text-anchor`. Keep the actual words. Do not convert text to outlines unless the user asks; note that fonts may differ.
- Icons: draw with strokes (`stroke-width`, `stroke-linecap="round"`, `fill="none"`) on a small grid (24x24) in a nested `<svg>` or `<g transform>`.
- Group logically with `<g id="...">` (e.g. `header`, `sidebar`, `card-1`) and give shapes meaningful ids. No inline JavaScript, no `<foreignObject>`, no external fonts/images/URLs (the app rejects or sanitizes scripts).
- Repeated elements: use `<defs>` + `<use>`.
- Photos or complex gradients/shading cannot be traced by hand: approximate with a `linearGradient`/`radialGradient` or a flat colour block, and tell the user what was simplified.

### Dieline / technical line drawings (this project)

If the image is a flat dieline or technical sketch, keep the units and line roles the importer in `packages/svg-import` understands:
- Cut: solid, dark or saturated red/blue/magenta line.
- Crease/fold: dashed line (any colour).
- Bleed: saturated green.
- Guides: anything else; very light solid lines are ignored.
Use one `<g>` per role. Prefer `mm` via `width="…mm" height="…mm"` with a matching `viewBox` when the user gives real dimensions; ask for the size if it matters.

## 4. Save, render, compare

1. Save the final file as `assets/svg/<name>.svg` in the repo root, using the name the user gave in step 1 (create `assets/svg/` if missing). All SVGs from this skill live in this folder, unless the user names a different folder. Use the scratchpad for drafts and comparison renders, not `assets/svg/`.
2. Render the SVG to PNG and look at it next to the original. Any of these works, use what exists:
   - Playwright MCP: open `file:///abs/path.svg` and take a screenshot (`browser_navigate`, `browser_take_screenshot`).
   - macOS: `qlmanage -t -s 1200 -o <dir> file.svg` (writes `file.svg.png`).
   - `rsvg-convert -w 1200 file.svg -o file.png`, `magick file.svg file.png`, `inkscape file.svg -o file.png` if installed.
3. Compare with the original (Read both PNGs). Fix the biggest differences first: layout/positions, sizes, colours, then text and small details. Do at most 3 refinement passes unless the user wants more.
4. Validate: `python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" file.svg` (well-formed XML), and make sure there is no `<script>`, `onload=`, `<image>` or external `href`.

## Tools (optional, check with `which`)

- Colour sampling / crop / size with Python (no install): `python3 -c "from PIL import Image; im=Image.open('a.png'); print(im.size, im.getpixel((x,y)))"` if Pillow exists. Otherwise `sips -g pixelWidth -g pixelHeight a.png` and `sips -c H W --cropOffset Y X a.png --out crop.png` on macOS.
- Auto-trace for flat one-colour or few-colour logos/silhouettes only: `potrace` (after `magick a.png -threshold 50% a.pbm`) or `vtracer --input a.png --output a.svg`. Auto-trace output is bulky and has no text or structure: use it for the silhouette, then clean up (merge paths, round numbers, name groups). Never use it for UI screenshots.

## Final reply

Short: the file path (`assets/svg/<name>.svg`), the size, what was approximated (photos, fonts, gradients), and an offer to adjust. Written in whatever style the session is in (caveman mode applies to the reply, not to the SVG or code).
