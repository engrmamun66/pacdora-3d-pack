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
| Auth | **Better Auth** (proposed) with Prisma adapter, email/password + **Google sign-up/sign-in (OAuth 2.0 / OpenID Connect)** + reset flow | Actively maintained. Alternative: Auth.js. Needs your confirmation. Status verified before install. |
| Storage | `StorageProvider` interface: local disk now, S3-compatible later | Same code path in dev and prod. |
| Units | millimetres everywhere internally | Convert only at display/export. Avoids unit bugs. |
| 2D editor | Fabric.js (pin exact version) | Selection, transforms, layers. Dieline is a **locked** layer built from engine paths. Artwork lives in dieline coordinates. |
| 3D | three.js + React Three Fiber + drei | As specified. |
| PDF | pdf-lib (low-level ops for named layers / spot color) | Vector output, page boxes control. |
| Illustrator exports (AI, EPS) | Shared vector "scene" → PDF-compatible `.ai` + hand-written EPS writer, with per-Illustrator-version profiles | See section 5.1. Native Illustrator internals are proprietary, so this is a compatible export, not a clone of Adobe's format. |
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
│  ├─ vector-scene/      neutral vector IR: layers, paths, strokes, spot colours,
│  │                     images, text-as-outlines (built from geometry + artwork)
│  ├─ render-pdf/        scene → vector PDF
│  ├─ render-illustrator/ scene → .ai (PDF-compatible) and .eps, version profiles
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
| AI / EPS export | vector scene (geometry + artwork) | User picks target Illustrator version; profile controls format features. See 5.1. |
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

### 5.1 Illustrator-compatible export (AI, EPS), version-wise

**Requirement:** user chooses a target Illustrator version at export time (e.g. CC, CS6, CS5, CS4, CS3, CS2, CS, 10, 9, 8) and gets an `.ai` or `.eps` that opens correctly in that version.

**Honest technical constraints (please read)**
- Adobe's native `.ai` format is proprietary and not publicly documented. Since Illustrator 9, an `.ai` file is a PDF container plus private Illustrator data. I will **not** reverse-engineer the private data.
- What we generate as `.ai` is a **PDF-compatible file with the `.ai` extension**. Illustrator opens it as a normal editable vector document: paths, named layers, spot colours, and artboard size are preserved. It will not contain Illustrator-private data (e.g. some live effects, original Illustrator metadata). Not byte-identical to a file saved by Illustrator.
- EPS **is** a documented format (PostScript + DSC / EPSF 3.0), so we write it directly.
- "Opens in Illustrator X" is a claim I can only make after testing a real file in that version. Profiles that have not been tested are marked **Untested** in the UI.

**Design**

1. **Vector scene (IR)** in `packages/vector-scene`. Built server-side and deterministically from the ProjectDoc: dieline geometry + artwork objects. Contains layers, paths, strokes, fills, spot colours, raster images, clip paths, and text. Text is **converted to outlines** (font parsing via opentype.js/fontkit) so output does not depend on installed fonts. SVG, PDF, AI and EPS are all backends of this one scene, so they cannot disagree with each other.
2. **Version profiles** in `packages/render-illustrator`, each a data object, not scattered `if` statements:

   ```ts
   interface IllustratorProfile {
     id: "cc" | "cs6" | "cs5" | ... ;
     label: string;
     tested: boolean;                 // true only after a real-app check
     ai: { pdfVersion: string; layers: boolean; transparency: "live" | "flatten";
           objectStreams: boolean; maxArtboards: number };
     eps: { psLevel: 2 | 3; compression: "flate" | "lzw" | "none";
            layers: "none" | "ai-comments"; preview: "none" | "tiff" };
   }
   ```
   Profile values (which PDF version, which features each Illustrator version accepts) will be **verified against Adobe documentation and real test files before being marked tested**. I will not fill the table from memory.
3. **AI writer:** PDF backend with `.ai` extension, PDF version and features chosen by profile. Layers via PDF optional content groups, named after line type (Cut, Crease, Glue, Bleed, Safe, Artwork, Dimensions). Older profiles that lack layer or transparency support get a documented fallback (flatten transparency; layers become separate named groups or are merged), and the UI shows what the chosen version loses.
4. **EPS writer:** custom small writer. DSC 3.0 header, `%%BoundingBox` and `%%HiResBoundingBox`, Level 2 or 3 operators per profile, Separation colour space for spot colours (die line), optional TIFF preview. Raster images embedded with a profile-allowed filter (Flate needs Level 3; Level 2 uses LZW/RunLength/DCT). EPS has no native layers; "Illustrator-style layer comments" in EPS are a legacy Adobe-specific feature and are **out of scope until verified** with a real Illustrator.
5. **Spot colour and line naming** configurable per project (e.g. die-cut spot name), since printers differ.
6. **Export API:** `POST /api/export` with `{ projectId, format: "ai" | "eps", illustratorVersion, options }`. Response also carries a **loss report** (what the chosen version could not represent).

**Validation plan (nothing marked supported without these)**
- Unit tests: scene → PDF/EPS structure checks (valid xref, DSC comments, BoundingBox equals dieline bbox + bleed, spot colour present, layer names present).
- Dimension test: parse output, measure dieline width/height in mm, compare to engine geometry (tolerance 0.01 mm).
- Cross-tool render test in CI-style script: open with Ghostscript (dev/test tool only, **not bundled**, because of its AGPL licence) and Inkscape, rasterise, compare to SVG render.
- **Manual test in real Illustrator versions** for each profile: needs access to the versions you care about. Without it, those profiles ship as Untested.

**Risks**
- Compatibility with old versions (CS2 and older) can only be checked with those installed. Likely unrealistic to test all; propose a supported shortlist (see decisions).
- Round-tripping artwork effects (shadows, blend modes) differs by version; v1 limits artwork to a supported feature subset and flattens the rest.
- Fonts: outlining removes editability of text in Illustrator. Optional later: keep live text when font is embeddable.

### 5.2 Authentication: email/password + Google

**Flow**
- Login and register pages both show **Continue with Google**. For Google, sign-up and sign-in are the same action: first time creates the user, later times log in.
- Standard OAuth 2.0 authorization-code flow with PKCE, scopes `openid email profile`, handled by Better Auth's Google provider. We never see the user's Google password.
- Server callback route: `/api/auth/callback/google` (exact path confirmed against Better Auth docs at install time).
- Profile name and avatar are copied from Google on first login.

**Account rules (security)**
- Google users have no password: `passwordHash` is nullable (or lives in Better Auth's `Account` table; decided in Phase 1 without changing your Users fields beyond that).
- Linking by email only when Google reports `email_verified = true`, and only to an account whose email is also verified. This prevents account takeover through an unverified email.
- Email/password sign-up requires email verification. A Google user may later set a password via "forgot password".
- Sessions are httpOnly, secure cookies; CSRF protection; rate limiting on auth routes (hardened in Phase 8).

**Google Cloud setup (you do this once; I'll give click-by-click steps in Phase 1)**
1. Google Cloud Console → create project → OAuth consent screen (External, app name, support email).
2. Create OAuth client ID, type **Web application**.
3. Authorized JavaScript origin: `http://localhost:3000`
4. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Put values in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (never committed).
6. While the consent screen is in **Testing** mode, only listed test users can sign in. For production, add the real domain's origin and redirect URI and publish the app (basic scopes need no Google review).

**Testing**
- Automated e2e cannot log in to real Google, so e2e uses a mocked OAuth provider; unit/integration tests cover linking rules and unverified-email rejection.
- Manual check with a real Google test user before Phase 1 is marked complete.

### 5.3 Human verification ("I'm not a robot")

Goal: stop bots from mass-registering, brute-forcing logins, and abusing costly endpoints.

**Provider (proposed): Cloudflare Turnstile.** Free, mostly invisible (no image puzzles for most users), privacy-friendly, works without hosting on Cloudflare. Better Auth has a captcha plugin that supports Turnstile, reCAPTCHA and hCaptcha (confirmed against current docs at install time). The provider sits behind a small `CaptchaVerifier` interface, so switching to Google reCAPTCHA or hCaptcha is a config change, not a rewrite.

**Where it applies**
| Action | Captcha |
|---|---|
| Register (email/password) | Yes |
| Login (email/password) | Yes |
| Forgot password / resend verification | Yes |
| Google sign-in | No (Google already verifies the user) |
| AI generation endpoint (Phase 7) | Yes, plus per-user quota (protects API cost) |
| Export / editor actions | No (logged-in users only; rate limited instead) |

**How it works (security-critical points)**
- Widget in the browser produces a one-time token. The **server verifies the token** with the provider's API before processing the request. A client-side check alone proves nothing.
- Fail closed: if verification fails or the provider is unreachable, the request is rejected with a clear message and retry option.
- Tokens are single-use and short-lived; replay is rejected by the provider.
- Secret key only in env (`TURNSTILE_SECRET_KEY`); site key public (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
- Layered defence, because a captcha alone is not enough: **rate limiting per IP and per account**, login lockout/backoff, email verification, and a hidden honeypot field on forms.
- Accessibility: provider's accessible fallback is kept enabled; forms remain keyboard-usable.

**Local development and tests**
- Dev uses the provider's official **test keys** (always-pass and always-fail variants documented by Cloudflare), so no real key is needed locally and e2e tests stay deterministic.
- Tests cover: missing token rejected, invalid token rejected, provider outage rejected, valid token accepted.
- Real keys needed before staging or production; they are tied to your domain.

### Database

Tables as specified (Users, Projects, Templates, Assets) plus indexes on `Projects(userId, updatedAt)`, `Templates(category)`, `Assets(userId, projectId)`. Better Auth adds its own session/account tables. Prisma migrations only; no manual schema changes. Large files stored via `StorageProvider`, only URLs in DB.

---

## 6. Most technically challenging components (ranked)

1. **Fold kinematics for tuck and dust flaps.** Insertion without interpenetration. Mitigation: closed state first; animation and collision much later.
2. **Artwork re-anchoring** when dimensions change, plus per-panel clipping. Data model and UX are both hard.
3. **Print-ready PDF.** Spot-colour Separation for the die line, TrimBox/BleedBox. Will **not** be labelled production-ready until validated with a printer or prepress person on a real file.
3a. **Illustrator-version AI/EPS export.** Proprietary `.ai` internals, per-version feature differences, and the need to test in real Illustrator versions. Also text-to-outline conversion and old-version fallbacks. See 5.1.
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
| 6 Export system (PDF and AI/EPS are long poles) | **L** | ~3–4 weeks (AI/EPS adds ~1.5–2 weeks, plus testing time in real Illustrator versions) |
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
- Auth (register, login, logout, profile, password reset, email verification).
- **Google sign-up and sign-in** ("Continue with Google"), account linking, see 5.2.
- **Human verification (captcha)** on register, login, password reset, see 5.3; plus rate limiting on auth routes.
- App shell layout, dashboard.
- **Exit:** register with email, log in, sign in with Google, see empty dashboard; migrations apply from scratch.

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
- Vector scene IR shared by all vector exports.
- SVG, PDF (vector, layers, page boxes), PNG, hi-res PNG, GLB, JSON.
- **AI (PDF-compatible) and EPS export with Illustrator version profiles**, loss report, export dialog with version picker, Tested/Untested badge per profile.
- Dimension validation of each export against the engine.
- **Exit:** exported files open correctly in external tools; PDF/AI/EPS measured at correct physical size; each profile marked Tested only after a check in the real Illustrator version.

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
Next.js, React, Tailwind, shadcn/ui, Prisma, zod, Better Auth, Fabric.js, three, @react-three/fiber, @react-three/drei, pdf-lib, opentype.js or fontkit (text to outlines), Vitest, fast-check, Playwright, Anthropic SDK (Phase 7).

**Dev/test-only tools (not shipped)**
- Ghostscript and Inkscape, to render and cross-check AI/EPS/PDF output (`brew install ghostscript inkscape`).
- Adobe Illustrator (any versions you want certified), for manual compatibility checks.

**Accounts/keys**
- Anthropic API key (Phase 7 only).
- **Google OAuth client** (Client ID + Secret) from Google Cloud Console, needed in Phase 1. Setup steps in 5.2. Free; needs a Google account.
- Other OAuth providers (e.g. GitHub) optional later.
- **Captcha keys** (Cloudflare Turnstile site key + secret, free account). Not needed for local dev (test keys), required for production.

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
6. **Illustrator versions to support.** Which versions do your users really need (suggest: CC, CS6, CS5 first, older only on demand)? Do you have Illustrator installed, and which versions, so profiles can be marked Tested?
7. **AI file expectation.** Is a PDF-compatible `.ai` (opens and edits in Illustrator, no Adobe-private data) acceptable? Native Adobe-identical `.ai` is not realistically achievable.
8. **Text in AI/EPS.** Outlined text (safe, not editable) for v1, OK?
9. **Google sign-in.** Can you create a Google Cloud project and OAuth client (steps in 5.2)? Any other providers needed (GitHub, Facebook, Apple)?
10. **Email delivery** for verification and password reset. Local dev uses a mail catcher (Mailpit in Docker). Production needs an SMTP provider (e.g. Resend, SES, or your own). Which?
11. **Captcha provider.** Cloudflare Turnstile (recommended, mostly invisible) or Google reCAPTCHA / hCaptcha? Using reCAPTCHA means your users get the familiar "I'm not a robot" checkbox; Turnstile can show a similar checkbox if you want it visible.

Reply with answers, or "go with your recommendations", to begin.
