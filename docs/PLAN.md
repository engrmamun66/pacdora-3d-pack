# Packaging Design Platform: Architecture and Development Plan

Status: **DRAFT for review. No code written yet.** Implementation of Phase 1 starts only after approval.

Date: 2026-11-08

---

## 0. Local environment (checked)

| Tool | Status |
|---|---|
| Node | v22.12.0 (OK) |
| npm | 10.9.0 (OK) |
| git | installed (OK) |
| pnpm | **missing** (enable via `corepack enable`) |
| Docker | **missing** (install Docker Desktop for Mac) |
| psql / PostgreSQL | **missing** (run Postgres in Docker; client tools optional) |

Working directory `/Users/mamun/apps/pacdora.bd.com` is empty.

---

## 1. Core idea

One versioned JSON document is the single source of truth. Everything else is a pure function of it.

```
ProjectDoc (JSON, versioned, zod-validated)
   │  params (dimensions, material, template id)
   ▼
Dieline Engine (pure TypeScript, no DOM, no React)  ──►  DielineGeometry
   │                                           (panels, paths, folds, glue, bleed)
   ├─► SVG renderer ──► SVG export + 2D editor backdrop
   ├─► PDF renderer ──► vector PDF (cut / crease on separate layers)
   ├─► Fold-tree builder ──► Three.js meshes ──► 3D preview, GLB export
   └─► Artwork (stored in dieline mm coordinates) ──► 3D textures, PNG export
```

**AI rule:** AI output → structured params → zod validation → deterministic engine. AI never produces or edits geometry directly.

---

## 2. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Repo layout | pnpm monorepo | Engine is its own package with zero DOM dependencies. The package boundary enforces "geometry separate from UI". Engine tests run in plain Node. |
| Web app | Next.js (latest stable, verified at install) + React + TypeScript strict + Tailwind + shadcn/ui | As specified. |
| Backend | Next.js route handlers (REST) | No separate server needed initially. PDF export runs in a route; can move to a worker later. |
| Database | PostgreSQL + Prisma, JSONB for project data | As specified. |
| Auth | **Better Auth** (proposed) with Prisma adapter, email/password + OAuth + reset flow | Actively maintained. Alternative: Auth.js. Needs your confirmation. Status verified before install. |
| Storage | `StorageProvider` interface: local disk now, S3-compatible later | Same code path in dev and prod. |
| Units | millimetres everywhere internally | Convert only at display/export. Avoids unit bugs. |
| 2D editor | Fabric.js (pin exact version) | Selection, transforms, layers. Dieline is a **locked** layer built from engine paths. Artwork lives in dieline coordinates. |
| 3D | three.js + React Three Fiber + drei | As specified. |
| PDF | pdf-lib (low-level ops for named layers / spot color) | Vector output, page boxes control. |
| Tests | Vitest (unit, property-based with fast-check), Playwright (e2e) | Geometry must be tested, not eyeballed. |
| AI | Anthropic API via server route, key in env, tool-use schema for param extraction | Added in Phase 7, architecture prepared earlier. |

---

## 3. Folder structure

```
pacdora.bd.com/
├─ apps/web/
│  ├─ src/app/
│  │  ├─ (marketing)/page.tsx              landing
│  │  ├─ (auth)/login, register, reset
│  │  ├─ (app)/dashboard, templates, projects, settings
│  │  ├─ editor/[projectId]/page.tsx       2D/3D workspace
│  │  └─ api/ auth, projects, templates, assets, export, ai
│  ├─ src/components/ ui/ (shadcn)  editor/  viewer3d/  templates/
│  ├─ src/features/ editor2d/  viewer3d/  projects/  export/  ai/
│  ├─ src/server/ db.ts  auth.ts  storage/  services/
│  └─ prisma/ schema.prisma  migrations/  seed.ts
├─ packages/
│  ├─ schema/            zod ProjectDoc v1 + migrations between versions
│  ├─ dieline-engine/    templates/  primitives/ (vec2, path, units)
│  │                     fold-tree/  validate/  annotate/
│  ├─ render-svg/        geometry → SVG string
│  ├─ render-pdf/        geometry → vector PDF
│  ├─ model3d/           fold-tree → three.js Object3D, GLB export
│  └─ ai-contract/       Claude tool schemas, param extraction + validation
├─ infra/ docker-compose.yml  Dockerfile  deploy/
├─ docs/ PLAN.md  architecture.md  schema.md  dieline-math.md  deploy.md
└─ storage/                (gitignored, local uploads)
```

---

## 4. How the parametric dieline engine works

Each template is a TypeScript module:

```ts
interface PackagingTemplate {
  id: string;
  schemaVersion: number;
  paramSchema: ZodSchema;        // what the user may enter, with min/max
  defaults: Params;
  build(params: Params): FoldTree;   // deterministic, pure
}
```

### The FoldTree

A dieline is a tree of flat panels joined by hinges.

- **Panel:** id, polygon in local 2D frame, role (front, back, side, lid, tuck, dust, glue flap).
- **Hinge:** parent panel, child panel, shared edge, fold direction (mountain/valley), target angle (usually 90°).
- **Layout step:** walk the tree, place every panel in 2D → the flat dieline.
- **Fold step:** walk the same tree, rotate each child about its hinge → the 3D shape.

Because 2D and 3D derive from the same tree, they cannot disagree. This is the "reliable geometry pipeline" instead of hand-modelling each template in 3D.

### Folding carton (first template)

Body panels in a row: `[glue flap][front L×H][side W×H][back L×H][side W×H]`, with top and bottom tuck flaps on the L panels and dust flaps on the W panels. Straight Tuck End and Reverse Tuck End share the engine; they differ in flap placement.

All dimensions are functions of L, W, H, material thickness, glue flap width and tuck depth.

### Accuracy rules

- Thickness compensation is a **configurable per-material rule**, not a hardcoded constant.
- Tuck depth, dust-flap angle, glue width are template parameters with documented defaults. **No invented industry constants.** Defaults will be checked against ECMA/FEFCO reference diagrams, and should be confirmed by a packaging professional before production use.
- Every path is tagged `cut | crease | perforation | glue | bleed | safe`; renderers map type to style.

### Validation (automated tests)

- Every cut path is closed.
- Dieline bounding box equals the closed-form expectation.
- Adjacent panels share hinge edges exactly (tolerance 1e-6 mm).
- Crease length equals the shared panel edge length.
- Folded 3D bounding box equals L×W×H.
- SVG snapshot tests.
- Property-based tests over random valid parameters.

---

## 5. How the JSON source connects to every output

| Consumer | Reads | Behaviour |
|---|---|---|
| SVG export | computed dieline | Paths styled by line type; dimension annotations; correct mm viewBox. |
| 2D editor | dieline + `artwork.objects` | Dieline is a locked Fabric layer. Artwork objects are editable, each anchored to a panel or free. Changing dimensions re-runs the engine and **re-anchors artwork to its panel**. |
| 3D preview | FoldTree + artwork | Each panel mesh gets UVs equal to its normalized dieline position. Texture = artwork rendered offscreen in dieline space. Inside/outside faces use separate materials. |
| PDF export | dieline + artwork | Page = bbox + bleed. Cut and crease as vector paths on named layers. Artwork placed as vector or image. |
| GLB export | 3D scene | three.js GLTFExporter. |
| PNG export | artwork + dieline | Offscreen canvas at requested DPI. |
| AI | params only | Claude returns params via tool-use schema → zod validation → engine. |

### Stored vs computed

The document stores **parameters** (the source). Computed geometry is cached with a hash of (engine version + params), so it can be regenerated and verified on load. Document has `schemaVersion`; migration functions upgrade old files.

### Conceptual ProjectDoc v1 sections

1. `meta` (name, id, createdAt, schemaVersion, engineVersion)
2. `template` (templateId, params)
3. `dimensions`
4. `material`
5. `dieline` (panels, cutLines, foldLines, glueAreas, bleed, safeArea, annotations) *cached/computed*
6. `artwork` (objects with panel anchor, transform, z-order)
7. `threeD` (modelType, foldAngle, materials, lighting preset)
8. `export` settings

The full zod schema is designed in Phase 2 and documented in `docs/schema.md`.

### Database

Tables as specified (Users, Projects, Templates, Assets) plus indexes on `Projects(userId, updatedAt)`, `Templates(category)`, `Assets(userId, projectId)`. Better Auth adds its own session/account tables. Prisma migrations only; no manual schema changes. Large files stored via `StorageProvider`, only URLs in DB.

---

## 6. Most technically challenging components (ranked)

1. **Fold kinematics for tuck and dust flaps.** Insertion without interpenetration. Mitigation: closed state first; animation and collision much later.
2. **Artwork re-anchoring** when dimensions change, plus per-panel clipping. Data model and UX are both hard.
3. **Print-ready PDF.** Spot-colour Separation for the die line, TrimBox/BleedBox. Will **not** be labelled production-ready until validated with a printer or prepress person on a real file.
4. **Texture mapping** across two-sided stock, seams and bleed.
5. **Editor performance** with large images.
6. **Fabric.js version API drift.** Pin the version.

---

## 7. Complexity estimate (one developer + AI assistance, part-time)

| Phase | Size | Rough time |
|---|---|---|
| 1 Foundation, auth, dashboard | M | 1–2 weeks |
| 2 Template system + 1 template | S–M | ~1 week |
| 3 Dieline engine + SVG + tests | **L** | 2–3 weeks |
| 4 2D editor | **L** | 3–4 weeks |
| 5 3D engine | **L** | 2–3 weeks |
| 6 Export system (PDF is long pole) | M–L | ~2 weeks |
| 7 AI features | S | 3–5 days |
| 8 Production prep | M | ~2 weeks |

Total: roughly 4–6 months to a solid v1 with one template. Each additional template costs days once the FoldTree is stable.

---

## 8. Phased roadmap

Each phase ends with a runnable app, passing tests, and a written "how to verify" checklist.

### Phase 0 (recommended, optional): Engine spike
Build `dieline-engine` + a throwaway SVG page for the carton only. Riskiest module first; wrong geometry would waste everything downstream.

### Phase 1: Project foundation
- pnpm monorepo, Next.js, TS strict, Tailwind, shadcn.
- Docker Compose Postgres, Prisma schema + migrations.
- Auth (register, login, logout, profile, password reset).
- App shell layout, dashboard.
- **Exit:** register, log in, see empty dashboard; migrations apply from scratch.

### Phase 2: Template system
- Full ProjectDoc zod schema with versioning.
- Template interface and registry, seed data.
- Searchable template library, parameter form with validation.
- One folding carton template wired in.
- **Exit:** pick template, enter dimensions, validated params saved to a project.

### Phase 3: Dieline engine
- Geometry primitives, FoldTree, layout step.
- Straight Tuck End carton (then Reverse Tuck End).
- Cut/crease/glue/bleed/safe lines, dimension annotations.
- SVG renderer; validation test suite.
- **Exit:** all geometry tests pass; SVG matches hand-calculated reference.

### Phase 4: 2D editor
- Fabric canvas, zoom/pan, grid, rulers.
- Text, images, logo upload, shapes, colours.
- Layers, alignment, undo/redo, selection.
- Panel-anchored artwork; save/load; autosave.
- **Exit:** edit artwork, reload, state identical.

### Phase 5: 3D engine
- Fold step, three.js geometry from FoldTree.
- Texture mapping from artwork, PBR materials, lighting, shadows.
- Orbit controls; live update on dimension/artwork change.
- **Exit:** folded bbox = L×W×H; artwork lands on correct faces.

### Phase 6: Export
- SVG, PDF (vector, layers, page boxes), PNG, hi-res PNG, GLB, JSON.
- Dimension validation of each export against the engine.
- **Exit:** exported files open correctly in external tools; PDF measured at correct physical size.

### Phase 7: AI
- Anthropic API route, env-based key.
- Tool-use schema for natural-language → params.
- zod validation + range checks before engine; reject or clamp with explanation.
- **Exit:** "carton 100×150×50 mm" produces a valid dieline; invalid output is rejected.

### Phase 8: Production preparation
- Security audit (authz on every route, upload validation, rate limits, CSRF, secrets).
- Performance pass, error handling, logging.
- Test coverage review, e2e flows.
- Dockerfile, production compose, VPS deployment doc, backup strategy (pg_dump + storage sync).

---

## 9. Required software and dependencies

**Install on your Mac**
- pnpm (via `corepack enable`)
- Docker Desktop for Mac (Postgres now, full stack later)

**npm packages (latest stable versions verified at install)**
Next.js, React, Tailwind, shadcn/ui, Prisma, zod, Better Auth, Fabric.js, three, @react-three/fiber, @react-three/drei, pdf-lib, Vitest, fast-check, Playwright, Anthropic SDK (Phase 7).

**Accounts/keys**
- Anthropic API key (Phase 7 only).
- OAuth client IDs (optional, when enabling Google/GitHub login).

---

## 10. Running and testing locally

```bash
corepack enable && pnpm install
docker compose up -d db            # PostgreSQL
cp .env.example .env               # set DATABASE_URL, auth secret
pnpm prisma migrate dev            # apply migrations
pnpm db:seed                       # seed templates
pnpm dev                           # http://localhost:3000

pnpm test                          # engine + schema unit tests (Node)
pnpm test:e2e                      # Playwright critical workflows
pnpm typecheck && pnpm lint
```

After each phase I provide exact steps and the checks that must pass before moving on.

---

## 11. Working rules (from your brief)

- Incremental, one phase at a time; app runnable after each.
- Nothing claimed complete without testing.
- No placeholder features presented as done.
- Geometry logic separate from UI; 2D and 3D engines separate.
- All user input validated; errors handled.
- No export labelled "production-ready" until validated.
- Major architecture changes need your approval first.
- No copying of Pacdora code, assets, or branding.

---

## 12. Decisions needed from you

1. **Docker Desktop vs Homebrew Postgres.** Recommend Docker (matches later VPS setup; ~1 GB install).
2. **Phase order.** Engine spike first (recommended) or your original order?
3. **Auth library.** Better Auth (recommended) or Auth.js?
4. **First template.** Straight Tuck End (recommended) or Reverse Tuck End?
5. **Packaging reference.** Do you have a packaging expert or real printer dieline samples to cross-check numbers?

Reply with answers, or "go with your recommendations", to begin.
