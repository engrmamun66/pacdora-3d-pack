# Packaging design platform

Original, Pacdora-inspired packaging design tool. See `docs/PLAN.md` for the full plan and `docs/dieline-math.md` for the geometry.

## Status

**Done:** parametric tuck-end carton dieline engine, SVG renderer, 3D folding (pure math + three.js model), dev viewer. All tested.
Not built yet: web app, database, auth, 2D editor, exports other than SVG, AI.

## Run (npm workspaces, Node 22)

```bash
npm install
npm test            # engine + renderer tests (includes randomized property tests)
npm run typecheck
npm run demo        # writes out/tuck-end-straight.svg and out/tuck-end-reverse.svg
open out/tuck-end-straight.svg
npm run viewer      # dev viewer: flat dieline + folded 3D, http://127.0.0.1:4310
```

## Layout

- `packages/dieline-engine`: pure TypeScript geometry (no DOM, no React). Params in, validated dieline out.
- `packages/render-svg`: dieline geometry to SVG string (mm units, one layer per line type).
- `packages/model3d`: folded carton as a three.js model; UVs from flat dieline coordinates.
- `scripts/demo.ts`: example usage.
- `scripts/viewer`: development viewer (not the product UI).
