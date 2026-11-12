# Packaging Design Platform: Architecture and Development Plan

Status: **Approved to start (2026-11-08). Phase 0 (engine spike) complete; Phase 1 not started.** See "Implementation log" at the end.

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
3. Authorized JavaScript origin: `http://localhost:3100`
4. Authorized redirect URI: `http://localhost:3100/api/auth/callback/google`
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
pnpm dev                           # http://localhost:3100
 
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


---

## 13. Implementation log

### Phase 0: engine spike (done 2026-11-08)
- Built `packages/dieline-engine` (tuck-end carton, straight and reverse) and `packages/render-svg`.
- 42 automated tests pass, including a property test (300 random valid parameter sets per run, 5 runs checked).
- Output visually checked for both variants (cut, crease, glue, bleed, safe area, dimensions).
- **Deviations from this plan (decided during build, please review):**
  1. **npm workspaces instead of pnpm.** Corepack on this machine fails to verify pnpm's signature (old corepack). The only workaround found disables signature verification, so it was not used. Fix later with `npm i -g corepack@latest` if you want pnpm back.
  2. **Clipper (`clipper-lib`, Boost licence) added for bleed and safe-area offsets.** A naive offset self-intersects in the narrow slits between dust flaps and closures. `clipper2-js` was tried first and returned wrong geometry for a plain square, so it is not used.
  3. **Param names are `width`, `depth`, `height`** (user-facing) rather than L/W/H.
- **Open risks:** all flap-size defaults are unverified (see `docs/dieline-math.md`); thickness compensation is only a simple allowance.

### Early Phase 5 work: 3D fold geometry (done 2026-11-08)
- `fold-tree/fold3d.ts` (engine, pure math): per-panel 4x4 transforms from the same fold tree as the 2D dieline; progress 0..1 and per-hinge overrides for future staged animation.
- Closed-box checks added to every generation (box size, seam, lids, print outward). They found a real rule: tuck flap must be shorter than the height.
- `packages/model3d`: three.js meshes, printed side textured with UVs = flat dieline coordinates (artwork on the 2D sheet lands on the same 3D panel), kraft inside.
- Dev viewer (`npm run viewer`) checked visually: closed, half-folded, back view.
- 63 automated tests pass.
- Not done yet: material thickness in 3D, staged fold animation order, GLB export, PBR material presets.


### Template source decision (2026-11-08)
- Reviewed pacdora.com/dielines (2,148 templates). Their Terms of Service forbid copying content or derivative works, and robots.txt disallows `/dielines-detail/`. **Decision (user): build our own parametric generators for public standard structures (FEFCO/ECMA, generic names); never import or scrape Pacdora files, IDs, descriptions or images.**
- First batch ("Core 8"): straight/reverse tuck end (done), crash-lock (auto) bottom, FEFCO 0201, FEFCO 0427 mailer, tray with lid, sleeve, pizza box.
- Engine features needed for that batch (seen as common industry features, implemented from scratch): **arc edges** (rounded flap corners), **tuck slits**, crash-lock **glue-crease hinges that stay flat when erected**, explicit **size mode** (inner / outer / manufacture).
- Export list gains **DXF** (Phase 6).

### Phase 1: foundation (done 2026-11-08)
- Docker via **Colima**; `infra/docker-compose.yml`: Postgres 18.6 (127.0.0.1:5433) + Mailpit (127.0.0.1:1025/8025).
- `apps/web`: Next.js 16.4.5 (App Router, cacheComponents), TypeScript 6, Tailwind 4, shadcn/ui (Base UI).
- Prisma 7.10.1 (pg driver adapter, `prisma.config.ts`), first migration: user/session/account/verification/rate_limit + template/project/asset with indexes and foreign keys.
- Better Auth 1.7.18: email/password (min 10 chars, verified email required), confirmation + reset emails, Google (enabled when keys set; links only to verified local accounts), Turnstile captcha on sign-up/sign-in/reset/resend, DB-backed rate limits (sign-in 5/min, sign-up 3/min, reset 3/5min), sessions revoked on password reset, open-redirect guard on `next`.
- Pages: landing, login, register, forgot/reset password, dashboard, settings (profile name, sign-in methods). `proxy.ts` gives optimistic redirects; every page and server action re-checks the session.
- **Verified in a real browser**: register -> email in Mailpit -> unconfirmed login blocked -> confirm link -> dashboard; profile update; logout; login with `next`; forgot -> reset -> old password rejected; reset token single-use; missing captcha rejected (400); rate limit returns 429.
- Bugs found and fixed during testing: Base UI menu label crash, self-referencing font variable, captcha ref usage flagged by React Compiler lint, TypeScript 7 incompatible with typescript-eslint (workspace pinned to TS 6.0.3), port 3000 taken (app uses **3100**).
- Google sign-in verified end to end with the owner's Google account (new user, verified email, avatar).
- **Phase 8 must-do:** configure trusted proxy IP headers (`advanced.ipAddress`) for production; locally every request shares one rate-limit key, and behind a proxy without this, one attacker could lock all users out of login.
- Dev-only audit warnings: 8 moderate in ESLint tooling (typescript-eslint), none in runtime dependencies.

### Engine upgrade for Core 8 (done 2026-11-08)
- Arc edges (DXF bulges) with exact area/bounds/length, true SVG arcs, fillet helper; rounded tuck tips and dust-flap corners; tuck slits as cut lines; size mode (manufacture / inner).
- Property test now also fuzzes corner style, slits and corner radii.

### Phase 2: template system (done 2026-11-08)
- Engine: generator registry with UI parameter descriptors (test keeps them in sync with the input schema) and our own preset catalogue (3 tuck-end presets).
- `packages/schema`: versioned ProjectDoc v1 (zod) with migration hook; geometry is regenerated from parameters, not stored.
- Web: template library (search + category filter, live thumbnails), template designer (grouped parameter form, live dieline preview, inline validation errors, default/auto placeholders, unverified-default warning), create / edit / delete projects (delete asks for confirmation), projects list, dashboard with recent projects, `npm run db:seed` syncs the catalogue table.
- Server re-validates every parameter set with the engine before saving; every query is scoped to the signed-in user.
- **Verified in browser:** library, live preview, invalid value blocks saving with a field error, create -> stored ProjectDoc v1, edit -> saved, delete. Second user cannot see or open another user's project (gets the not-found page; status 200 because the page streams).
- Known limits: parameter input in mm only (inches later); 3D preview not yet in the app (Phase 5); templates require login.

### Core 8: crash-lock bottom (done 2026-11-08)
- Engine refactor: shared tube-carton module (`carton-common.ts`: base params, builder, finishing) and template-neutral checks (`CartonExpectations` + per-template extra checks). Tuck end unchanged in output; engine version 0.3.0.
- New generator `crash-lock-carton` (own construction, documented in `docs/dieline-math.md`): 45 degree glue tabs folding 180 degrees, lock flaps, slits. 21 checks incl. closed-bottom coverage, no overlap, tab-on-flap and lock-engage areas (Clipper boolean areas).
- New panel roles `bottom-flap`, `lock-flap`; 3D viewer stacks layers (outer flap < glue tab < lock flap).
- Fix found by property test: a non-zero taper below the 0.1 micrometre grid made two edges coincide; now rejected (0 or >= 0.01 mm).
- Fix: default tuck depth now also stays below 0.9 x height, so short boxes no longer fail on defaults alone.
- **Verified:** 124 tests; dev viewer flat + closed + half fold; web library, designer (21/21 checks, depth > width error shown), project created and saved.

### Core 8: FEFCO 0201 regular slotted container (done 2026-11-08)
- `TubeBuilder` / `TubeLayout` split out so tubes without tuck parameters reuse body, joint, finishing and annotations.
- New generator `slotted-box`: 8 flaps W/2 deep, slots centred on creases (slits when slot = 0); 22 checks incl. major flaps meeting at the centre and end coverage `L x W - s^2`.
- Preset "Regular slotted shipping box" (category Shipping).
- **Verified:** 139 tests (incl. 300-case property test and broken-fold detection); dev viewer flat + 85% fold; web designer 22/22.

- Remaining Core 8 generators (FEFCO 0427 mailer, tray with lid, sleeve, pizza box) postponed by request (2026-11-08); phases first.

### Phase 4: 2D artwork editor (done 2026-11-08)
- **Artwork schema** (`packages/schema/src/artwork.ts`): our own format, not Fabric's. Objects: text, image, rect, ellipse, line. Millimetres; each object's centre stored as offset from its panel's bounding-box centre (`panelId`, `dx`, `dy`), so artwork follows its panel when box dimensions change. Strict zod validation (colours, 6 bundled fonts, sizes, unique ids, 2000 objects, 1 MB).
- **`packages/artwork`**: pure anchoring math (panel hit test, anchor round trip, orphan detection). Shared later by 3D texture and exporters.
- **Fonts**: Inter, Roboto, Montserrat, Oswald, Lora, Playfair Display (SIL OFL, `@fontsource`, self-hosted). Same files will be used for text-to-outline in exports.
- **Uploads**: `POST /api/assets` (PNG/JPEG/WebP identified by magic bytes, SVG rejected, 10 MB, per-user quota, same-origin check), `GET /api/assets/[id]` owner-only with `nosniff` + `default-src 'none'`. `StorageProvider` interface, local disk (`STORAGE_DIR`, default `apps/web/storage`, gitignored).
- **Editor** (`/editor/[id]`, Fabric 7.4.0 pinned): mm scene units; sheet, bleed, glue, grid drawn under artwork; cut/crease/safe/bleed lines drawn over it at constant 1 px; rulers in mm; zoom (Ctrl/Cmd + wheel or pinch, buttons, fit), pan (wheel/trackpad, Space or middle-drag); add text/shapes/images; properties panel; layers (select, show/hide, lock, reorder); align to panel; duplicate, delete, arrow nudge (Shift = 10 mm); undo/redo (100 steps); autosave (debounced, one request at a time, retry after network failure) + Ctrl/Cmd+S; unsaved-changes warning.
- **Server**: `saveArtwork` action re-validates schema and size, and checks every referenced image belongs to the user.
- **Bugs found while testing and fixed**: autosave retried in a tight loop when offline (unit test); each autosave refreshed the page props and rebuilt the editor, losing undo history (browser test).
- **Verified:** 153 tests (anchoring, schema, image sniffing, autosave). In the browser: add all object types, upload logo (SVG disguised as PNG rejected 415; cross-site 403; signed-out 401), mouse select + drag (object re-anchors to the panel it is dropped on), properties edit, duplicate/delete/undo/redo via keyboard, reload: artwork identical (0 differences across 7 objects).
- Known limits: no snapping/smart guides, no clipping to panels, no text on path, no gradients, raster images only (no SVG/PDF/AI import), uploaded images cannot be deleted from the UI yet, 2D only (3D comes next).

### Phase 5: 3D preview in the app (done 2026-11-08)
- Editor shows a live 3D view beside the 2D canvas (toggle "3D"). Built with plain three.js on top of `packages/model3d` (the tested fold/UV code) instead of React Three Fiber: same result, two fewer dependencies.
- Artwork texture: the editor's own Fabric mapping renders the artwork offscreen in flat-sheet space (bleed bounds, up to 4096 px, board colour as background), so 3D shows exactly what the 2D editor shows. Updates ~0.35 s after each change.
- Controls: orbit/zoom, fold slider + fold animation, reset view, board (outside) and inside colours. Fold and colours are saved in the project (`threeD`, validated server-side).
- Neutral tone mapping so printed colours stay close to the artwork.
- **Bug fixed while testing:** with React Strict Mode the renderer was recreated but the camera was not re-framed (view started inside the box).
- **Verified in the browser:** artwork appears on the correct faces (front text/logo; circle and rectangle on the back), text reads unmirrored, a text change shows in 3D within about a second, 40% fold shows the kraft inside colour, fold setting survives reload. Folded size = L x W x H is enforced by the engine's folded checks on every generation.
- Known limits: zero-thickness panels; the animation folds all hinges together (not a real erecting sequence); inside print not supported yet; no 3D on the project page (editor only).

### Phase 6: exports (done 2026-11-09)
- **Vector scene** (`packages/vector-scene`): one neutral description (layers, paths, images, RGB and spot paints) built from geometry + artwork; SVG, PDF, AI and EPS are all written from it, so they agree. Arcs become cubic Béziers. Text is converted to outlines with fontkit from the same font files the editor uses, laid out with the editor's own text-box rules.
- **Formats:** PDF (vector, MediaBox = bleed, TrimBox = cut size, BleedBox; die lines as Separation spot colours "CutContour"/"Crease" (names configurable) with overprint; optional-content layers), AI (PDF-compatible, per Illustrator profile), EPS (EPSF 3.0 / DSC, Level 2 or 3), SVG (mm, named layers), DXF R12 (CUT/CREASE layers, true arcs), PNG 150/300 dpi with pHYs DPI metadata (browser; reduced automatically below browser canvas limits and reported), GLB (browser, metres), JSON project file.
- **Illustrator profiles** (`packages/render-print/src/profiles.ts`): CC = PDF 1.7 + layers; CS6..CS = PDF 1.5 + layers; 10 = PDF 1.4, no layers; 9 = PDF 1.3, transparency flattened; 8 = EPS only (8's .ai is PostScript-based). PDF-level facts (1.3 no transparency, 1.4 no layers, layers from 1.5) are from Acrobat/Adobe documentation; the per-version mapping is **unverified, so every profile is marked Untested** in the UI.
- **Loss report** with every export: e.g. characters missing from the font, substituted styles (Oswald has no italic), no layers / no transparency in EPS and old PDF, SVG has no spot colours, DXF has no artwork.
- **Export dialog** in the editor; server exports first wait until the latest edits are saved.
- Uploads are now PNG/JPEG only (WebP removed: the print writers embed PNG/JPEG natively).
- **Verified:** 186 tests incl. Ghostscript cross-checks (renders every AI profile and both EPS levels without errors; `tiffsep` shows CutContour and Crease as separate plates), page boxes in points, DPI metadata, ASCII85/RunLength round trips. All 9 formats downloaded through the dialog in the browser; PDF/AI/EPS have identical ink bounds in Ghostscript; 300 dpi PNG = 301 x 241 mm = bleed size; GLB valid glTF 2.0 with embedded texture and metre scale.
- Known limits: profiles untested in real Illustrator; no PDF/X or ICC output intent yet; no live (editable) text in AI; RGB artwork colours (no CMYK conversion); latin-only font subsets (e.g. Bangla text is reported as missing).

### Phase 7: AI "describe your box" (built 2026-11-09; live API call not yet tested)
- `packages/ai-contract`: Claude (`claude-opus-5-5`, low effort, structured output from a Zod schema, server-side refusal fallback `fallbacks: "default"`) returns only a catalogue preset id, three dimensions, size mode, optional board thickness, notes and a status (ok / needs_info / unsupported). The system prompt is built from the template catalogue; the customer text is treated as data.
- `interpret()` (pure, deterministic): strict zod ranges, then the real dieline engine. Engine rule violations come back as issues; nothing from the model bypasses validation and no geometry comes from the model.
- Web: "Describe your box" panel on the templates page (shown only when `ANTHROPIC_API_KEY` is set). Server action guards: signed in, length (1000 chars), per-user daily quota (`AI_DAILY_LIMIT`, default 20, table `ai_request`), Cloudflare Turnstile verified server-side (fails closed), typed API errors. "Open in designer" passes the parameters via `?p=`; the designer keeps only known keys and the engine re-validates.
- **Bug found by tests and fixed:** a "needs_info" answer (0 for missing dimensions, as the prompt asks) was rejected by the range check.
- **Verified:** 12 unit tests with a fake client (request shape: model, structured output, effort, fallbacks, no forced tool choice; refusal and unparseable answers; engine rejects bad combinations even when the model's JSON is well formed). In the browser: panel hidden without a key; prefill works; unknown keys dropped; bad JSON ignored.
- **Not verified:** a real call to the Anthropic API (no key on this machine). To test: set `ANTHROPIC_API_KEY` in `apps/web/.env.local`, restart `npm run dev`, open Templates.

### Phase 8: security and production preparation (done in code 2026-11-09; deployment itself not exercised)
- **Independent security audit** (a separate reviewer agent read all routes, actions and exporters; I verified each finding against the code). No cross-user access found: every project and asset read or write is scoped by the signed-in user. Findings fixed:
  - PNG decompression bomb and unbounded image work: upload checks the image header (max 12000 px per side, 40 megapixels); exports refuse oversized images before decoding, cap total embedded image data (150 MB per export), read each image once and store it once in the PDF.
  - Upload body not bounded when sent chunked: now requires Content-Length (411) and 10 MB limit.
  - No rate limits on expensive actions: per-user limits on export (10/min, plus max 3 running at once per server), upload (30/min), artwork save (120/min), 3D save (60/min), AI (daily). Counted under a per-user database lock; verified under parallel load (exactly 10 of 14 parallel exports and exactly 30 uploads/min allowed).
  - AI daily quota race (parallel requests all passed the check): now reserved atomically before the paid call.
  - Upload quota race: reserved atomically in one transaction with the database row.
  - Security headers on every response: CSP limited to `frame-ancestors 'none'`, `base-uri`, `form-action`, `object-src 'none'`; plus X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS (production), no X-Powered-By. **Not done:** a `script-src` CSP (needs per-request nonces with this framework).
  - Export errors no longer leak internal paths/library messages (generic message + reference id, details in the server log); the `X-Export-Report` header is capped (15 notes, about 4 KB).
  - Open redirect via tab/newline in `?next=` (e.g. `/%09/evil.com`): control characters and backslashes rejected (tests added).
  - Production environment checks: `BETTER_AUTH_URL` must be https and the Turnstile secret must not be a Cloudflare test key (skipped for localhost and during build). The server now validates its environment at startup (instrumentation), so a bad deployment fails every request with a clear log message instead of half working.
  - Stored project documents that cannot be parsed give a clean error instead of a 500; project id length checked.
- **Trusted proxy:** client IP header configurable (`CLIENT_IP_HEADER`). Verified: with a consistent IP the sign-in limit is 5 per minute then 429; forged varying IPs bypass it, so the reverse proxy MUST overwrite the header (documented in `docs/deploy.md` for Caddy, nginx, Cloudflare).
- **Production build:** `next build` passes with zero warnings; production server smoke-tested (routes, redirects, headers).
- **Deployment files:** `Dockerfile`, `infra/docker-compose.prod.yml` (database not exposed, app bound to 127.0.0.1, uploads volume), `infra/.env.prod.example`, `scripts/backup.sh`, `scripts/restore.sh`, `docs/deploy.md`.
- **Not verified (be aware):**
  - The Docker image: inside the image `npm ci` and `next build` succeeded, but the final stage failed because the Mac's disk was 100% full (the Colima VM disk then reported I/O errors). The runtime stage, container start and the production compose stack have **not** been run.
  - Backup and restore scripts have not been run. Test a restore before relying on them.
  - A real AI call (no API key), real Turnstile/Google/SMTP production settings, and real Illustrator opening of `.ai`/`.eps` files.
- **Known gaps left on purpose:** no uploaded-image delete screen (uploads are never removed; files of deleted accounts stay on disk); no script-src CSP; export runs inside the web process (limited by concurrency cap, not a separate worker); rate limits are per server process for concurrency and database-backed per user for rates; no automated browser end-to-end suite (checks were done by hand through the browser tool).

- **Next:** free disk space on the Mac, restart Colima, re-run the Docker build and the compose stack (see docs/deploy.md), then decide the open questions (product name, SMTP provider, Illustrator versions, printer confirmation).

### Dielines workspace redesign (after Phase 8)
- `/templates/[id]` and `/projects/[id]` now render one full-screen workspace (`components/dielines/`, route group `(workspace)`, no sidebar): left icon rail + settings (Size, Structure, Material, Print, Flaps, Info), centre sheet with legend and a toolbar (pan, wheel/keyboard zoom, fit, toggles for dimensions, bleed, safe area, glue, panel labels), right column with the folded 3D carton (Open/Close slider, play, camera reset) and a file-format card (Illustrator, PDF, DXF, SVG, GLB).
- Units: mm/in switch changes only what is typed and shown; values are stored in mm. Dimension labels on the sheet follow the unit.
- Material: family then grade then "Custom". Calipers are **typical values written by us, not supplier data** (the UI says so). Corrugated stops at single-wall A-flute because the engine limits board thickness to 5 mm; double/triple-wall flutes (BC, AB, BCB ...) need that limit raised first (decision for you and your board supplier).
- Download: saves the project (creating it if new), then calls the existing export route with artwork off and die lines on; GLB comes from the preview. A new project is opened as `/projects/<id>` after its first download.
- Verified in browser (create mode, dummy session cookie): layout, pan/zoom controls render, unit switch (3 in = 76.2 mm, annotations in inches), material/grade/custom thickness logic, fold slider. **Not verified:** Save, Create project and every Download, because the dev database is down (full Mac disk, see above).
- Known: 3D camera is framed for the closed box, so the sheet is cropped near fully open; flat sheet is not auto-refit when its size changes (Fit button).

### Landing page and super admin (after Phase 8)
- **Home page:** header menu (Templates, Features, How it works, File formats; Log in / Get started, or Open dashboard when signed in; plain `<details>` menu on small screens). Full-height hero with a real 3D carton from our own engine that loops unfold, flat, fold, with a slowly turning camera, a printed pattern, and the flat dieline drawing itself behind it. Falls back to the drawn dieline without WebGL, and to a still closed box with `prefers-reduced-motion`. Pages below: features, how it works, formats, call to action. No language switch (we only have English). Verified in headless Chrome (desktop screenshot). **Not verified:** the loop timing in a live browser, and the phone layout (the headless window was wider than 390 px, so the phone screenshot was inconclusive).
- **Super admin (`/doraadmin/*`):** `/doraadmin/login` (email, password, captcha; every failure shows the same message; a non-admin who signs in is signed out again), `/doraadmin` overview (users total/verified/new/active/suspended, 14-day sign-up chart, projects, images and storage, exports and uploads in the last 24 h, AI requests in 7 days), `/doraadmin/users` (search, paging, suspend / restore). Admin pages are `noindex`.
  - **Role:** `user.role` column (`user` or `superadmin`), set **only** by the server CLI: `npm run admin:create -- someone@example.com` (`--revoke` to remove). The person must already be registered with a confirmed email. There is no promotion in the web UI.
  - **Checks:** `requireSuperAdmin()` reads the role from the database on every admin page and action (not from a cookie), so removing the role or suspending takes effect at once. The proxy only does the optimistic cookie check.
  - **Suspend:** sets `banned`, deletes all the user's sessions in one transaction, and a Better Auth `session.create.before` hook refuses new sessions for suspended users (email and Google). Super admins cannot be suspended from the UI.
  - **Database:** migration `20261109120000_superadmin` (adds `role`, `banned`, `bannedAt`, `banReason` to `user`). Hand-written because the dev database is down; **not yet applied**. Run `npm run db:migrate`.
  - **Not verified:** everything that needs the database (login, overview numbers, users table, suspend). tsc and eslint pass.
  - **Not done yet (next steps):** audit log of admin actions, two-factor login for admins, delete user / project / image, admin pages for projects and storage. `npm run admin:create` uses `tsx`, which is a dev dependency: it is not inside the production Docker image, so on the server run it from a machine that has the repo and can reach the production database (to be improved).

### Hero smoothing, admin settings, default admins
- **Hero animation fix:** the folding box used to be rebuilt through React state 30 times a second, with real-time shadows (flicker on near-flat folds), a CSS-floating dieline and a camera framed only for the closed box. Now: the fold is pushed straight into the 3D view once per display frame (`CartonView.setProgress`, no React render), shadows are off (soft CSS contact shadow instead), the fold never reaches exactly flat (0.08, avoids coplanar flicker), the camera is framed for the open sheet (`frameMm`), and the grid's fade mask sits on a fixed wrapper so only a cached layer scales. **Not verified:** smoothness in a live browser (only still screenshots were taken); if it still stutters on your machine, tell me the browser and I will measure.
- **Box look:** indigo board with a light diamond lattice and an amber band (was beige with blue dots), no large ground shadow.
- **Admin Settings** (`/doraadmin/settings`): your account, change password (other devices signed out), and read-only system status (database, URL, engine version, Google, captcha key type, email server, AI, client-IP header, storage, rate limits). No secrets are shown.
- **Default super admins:** `npm run db:seed:admins` reads `SEED_SUPERADMINS` (JSON) from the git-ignored `apps/web/.env.local` and creates or resets them as verified super admins. Refuses to run in production. Passwords are **not** in the code or docs.
- **Verified against the real database:** migration applied; both default admins sign in; `/doraadmin`, `/users`, `/settings` render for them; a normal user gets no admin data (redirected to the admin login); a suspended user is refused at sign-in (403). **Not tested in a browser:** the Suspend button itself and the change-password form.
- **Admin header and profile:** the admin panel now has a top header with a user icon (right) opening a menu: Profile, Settings, Sign out. `/doraadmin/profile` shows the signed-in super admin (name, email, role, member since, last activity, active sessions, sign-in methods, own projects) with display-name edit and change password. `/doraadmin/settings` is now system status only. Verified: all three pages render for a super admin and the production build passes. **Not seen in a browser by me:** the new header and menu. A dev-only "uncached data" notice appears in the dev terminal for `/doraadmin/*`; `next build` is clean and the same pattern on customer pages does not show it (cause not yet found).
- **Hero fold fixed (staged):** the lid never looked like it moved because all hinges folded at the same rate. Now one stage value drives the box: walls build first, then dust flaps, the lid, and the tuck last (opening plays backwards: tuck pulls out, lid lifts, then the body unfolds). Logic in `apps/web/src/lib/hero-fold.ts` with unit tests (found and fixed a wrong test assumption while writing them). Loop is 14 s: closed, lid opens, hold, unfold flat, hold, fold, close.
- **Admin Settings > Home page:** "Box initial position" (Closed / Lid open / Flat sheet: where the loop starts and what reduced-motion visitors see) and "Background colour" (picker + hex, or default gradient; text and menu switch light/dark automatically by luminance). Stored in the new `site_setting` table (migration `20261109150000_site_settings`, applied), read by the home page through `"use cache"` (refreshes within a minute and immediately on save via `updateTag`). Verified against the real server: valid save stored and shown on the home page (dark background, lid-open pose), invalid colour and invalid position rejected without changing the stored value. Test value removed afterwards. **Not seen live:** the animation in motion.
- **Animation box background:** Settings > Home page has a second colour option, "Animation box background": a rounded panel behind the animated box (default: none, hero shows through). Its caption and lines switch light/dark by luminance. Stored as `boxBackground` in the same `hero` setting (older saved values without it still load). Verified: valid colour saved and rendered (screenshot), invalid colour rejected without overwriting. The box's own colour (indigo) is not configurable yet.
- **Box colour:** Settings > Home page now has "Box colour" (the animated box itself, default indigo `#3f4fd0`), separate from the hero background and the panel behind the box. The pattern lines switch light/dark with the colour. Verified: `#e11d48` saved and rendered (screenshot); a bad value is rejected.
- **Hero scroll bug fixed:** the 3D view captured the mouse wheel (page could not scroll over the hero, and it zoomed the box far in) and blocked vertical swipes on touch screens. The hero view is now rotate-only (`rotateOnly`): no wheel zoom, no pan, vertical swipes scroll the page.
- **Toaster (bottom right):** `sonner` mounted in the root layout (`position="bottom-right"`, rich colours, close button). One helper, `lib/notify.ts` (`notify.success / error / warning / info / dismiss`), used for: project Save and every download result (success, limitations as warning, GLB note as info, failures as error), editor autosave failures (one toast, dismissed on recovery), image upload errors, export dialog, admin hero settings save, change password, profile name, suspend / restore user (now returns a result instead of a silent redirect), registration, forgot/reset password, login warnings (unconfirmed email, rate limit). Inline messages stay where they help screen readers and field errors. Admin Settings > Notifications has four buttons to preview all styles. Verified in headless Chrome: all four toasts appear bottom right.
- **Mobile hero:** the animated box comes first, then the text (`order-first` below the `lg` breakpoint; shorter box area on phones). Verified with a 390 px emulated screenshot. Also wrapped the hero in `Suspense`, which removed the Next dev "1 Issue" notices on `/`; the `/doraadmin/*` dev notices remain.
- **Settings layout:** `/doraadmin/settings` now has tabs on the left and the chosen section on the right (on narrow screens the tabs become a scrollable row on top). Tabs are real routes: `/doraadmin/settings` (Home page), `/doraadmin/settings/notifications`, `/doraadmin/settings/system`. Each page checks the super-admin role itself. Verified: all three return 200 with the right content; screenshot of the system tab.

### Template categories and SVG template import (stage 1)
- **Public address:** `/template/dieline/{slug}` (login required, like the rest of the app). The old `/templates/{slug}?p=...` redirects there (config redirect, query kept). `/templates` is now the browse page: search, a By uses / By models switch, category chips (empty categories hidden), links to the new address.
- **Categories:** table `template_category` (kind `use` or `model`, slug, name, order, visible) and many-to-many with templates. "All" is not stored (it means no filter). Seeder (`npm run db:seed`, also `prisma/seed.ts`): 16 "By uses" and 21 "By models" from your list; re-running only adds missing ones and never overwrites names or order an admin changed; the 5 built-in templates start in sensible categories once. Seeding no longer overwrites a built-in template's name, description or visibility (code owns only the generator and defaults).
- **Admin menus:** Templates and Template categories. Categories: tabs By uses / By models, add, edit inline, order, hide, delete (links removed, templates kept). Templates: list with thumbnail, categories, source, status, filters (search, category, source, status), paging, view (new tab), edit, hide/publish, delete (imported only; built-ins can only be hidden; templates with customer projects cannot be deleted).
- **Add / edit template (stepper):** 1 Categories, 2 SVG file (drop or choose, units auto-detect or your choice, scale, px per inch, size and warnings shown), 3 Customize (every line style gets a role: cut, crease, bleed, guide, ignore; auto-guessed, change any; animated drawing preview with replay), 4 Details and publish (name, slug locked after creation, description, published). Built-in templates only have steps Categories and Details. The server parses the SVG again on save; the browser's geometry is never trusted. Slug and category checks, size limits (3 MB SVG, 6 MB stored geometry).
- **SVG parser** `packages/svg-import` (new; written by a helper, reviewed and run by me): own tolerant XML reader (no entity expansion, no network), all path commands incl. arcs, transforms, `<style>` classes, `<use>`, units, limits against hostile files; clean SVG and DXF writers. 71 tests pass (including entity bomb, deep nesting, huge point counts, NaN, performance). Limits it does not handle: clip-path, mask, pattern, preserveAspectRatio, CSS combinators. Only hand-made fixtures were tested; **no real Illustrator, Inkscape or Figma export has been tried yet** (please try yours and send me any that fail).
- **Public page for an imported template:** pan and zoom sheet, legend, bleed and guide toggles, size in mm and inches, SVG and DXF downloads made in the browser.
- **Verified in a real browser run (headless Chrome driving the real app and database):** pick categories, upload an SVG, see detected size and roles, customize, create; list shows it with a thumbnail; publish; public page renders and appears in the browse page; edit without re-upload (change a role, name), built-in edit has two steps, category add and delete, template delete (the delete button does not exist for built-ins). Production `next build` passes. All 282 tests pass.
- **Not done yet (stage 2 and 3):** imported dielines have **no 3D folding and no artwork editor / projects** (that needs panels and folds: automatic detection from the lines plus a manual fix-up screen), no parametric resizing, no PDF/AI export for them, no drawing tool for building a template from scratch. Real DXF/SVG downloads were not opened in CAD or Illustrator.

## Template editing and box background image

Asked for: every template field editable by an admin, including a background image; customers can add a box background image on the front end.

**Box background (customer side).** `artwork.background` is a new optional field in the artwork schema (`assetId`, `fit` cover/contain/stretch, `scale`, `dx`, `dy`, `opacity`). It is one image under all other artwork that fills the print area (bleed bounds), not tied to a panel. `backgroundPlacement()` in `@packaging/artwork` is the single place that works out where it goes; the editor canvas, the 3D texture (`renderArtwork`) and the vector exports all use it. Vector exports (SVG, PDF, AI, EPS) get it as the first artwork item with a new optional `clip` on image scene items, so it never paints outside the print area (checked with Ghostscript: the dimension margin stays white). DXF has no artwork. Editor: "Box background" row in Layers, and the Properties panel shows its controls when nothing is selected (upload, pick from own images, fit, zoom, offset, opacity, reset, remove). It is part of undo/redo and autosave. `saveArtwork` also checks that the background image belongs to the user.

**Template background (admin side).** `Template.backgroundKey/backgroundMime` (migration `20261110100000_template_background`). Upload and removal go through `/api/doraadmin/template-background` (super admin, same-origin, PNG/JPEG, 10 MB, size-bomb check); the picture is served at `/api/templates/{slug}/background` to signed-in users (unpublished: super admin only). It is used two ways: new projects of a built-in template start with it as their box background (copied into the user's own images, best effort, never blocks project creation); on an imported-SVG template page it fills the dieline inside the closed cut outlines (toggle "Background"; included in the SVG download).

**Everything editable.** The template wizard (edit mode) now also edits: slug (imported templates only; blocked when projects exist; old address stops working), display order, background image. Built-in templates still keep their address, shape and default sizes, which come from the generator in code.

Not done: background preview on the parametric (built-in) template page; PDF/AI export of imported SVG dielines; panels/fold detection for imported dielines (stage 2).

## Imported (SVG) templates behave like built-in ones (level 1)

Decision (user): level 1 first (projects, artwork, exports, resizing); 3D fold detection later.

- **Generator.** `createImportedGenerator(templateId, flat)` in `@packaging/dieline-engine` turns an imported dieline (lines sorted by role: cut, fold, bleed, guide) into a normal `GeneratorDefinition`. Params: `width` (overall width in mm, the whole sheet scales uniformly about the outline's corner) and `bleed` (default = bleed the file drew, else 3 mm; bleed outline = offset of the outer cut). Closed cut shapes become cut loops (largest = outline, others holes), open cut lines become slits, fold lines become crease lines, closed guide shapes become safe areas. The foldTree is a single "sheet" panel with no hinges, so it has no 3D. `assertImportable` requires a closed cut outline; the template wizard and `saveTemplate` both enforce it.
- **Plumbing.** `@packaging/svg-import` `toFlatDieline`; `server/imported-templates.ts` (`loadImportedSource`, `resolveGenerator`, cached per template edit). Project docs store `generatorId "svg-import"`, `presetId` = template slug and small params; geometry is rebuilt from the template row (server: export, create, save; browser: workspace and editor get the lines as a prop). Editing an imported template later changes its existing projects (artwork is anchored to the sheet centre, in millimetres).
- **UI.** `/template/dieline/{slug}` for an imported template is the same workspace as built-ins (size, print, info, Create project, SVG/PDF/AI/DXF downloads). The editor works as usual (text, shapes, images, box background); 3D toggle, 3D panel and GLB export are hidden for flat-only dielines. Project lists use the template's saved thumbnail. The earlier SVG-only viewer page is removed (its background-fill preview went with it; the template background still seeds new projects).
- **Not done:** 3D fold for imported dielines (needs panel/hinge detection plus an admin fix-up screen), per-panel artwork anchoring (artwork is anchored to the whole sheet), height/depth style parametric resizing.

## 3D fold for imported dielines and starting 3D view (level 2)

- **Fold setup (admin).** `FoldSetup` (panels, hinges with signed angle and step order) is stored in `Template.geometry.fold`; `Template.hasFold` marks it for lists. `detectFoldSetup(flat)` (engine, `imported-fold*.ts`) finds panels by planar face detection over cut and fold lines (even-odd cut loops, T-junction noding, spatial hash), merges collinear shared fold edges into hinges, builds a spanning tree from the largest panel, defaults every angle to 90 degrees and step = depth. Checked against the engine's own tuck-end, crash-lock and slotted cartons (panel/hinge counts and folded size match). `validateFoldSetup` and an engine dry run at default, smallest and largest width guard every save (`saveTemplate`). Fold steps use `Hinge.foldOrder` and `stagedHingeProgress`, applied inside `foldTree()` so 3D, hero and the admin preview all animate in steps with no consumer changes.
- **Admin screen.** `fold-setup-editor.tsx`: flat sheet with coloured panels and numbered fold lines, panel inspector (name, kind, printable, size, make base), fold table (step, angle, inward/outward), live 3D preview with a step-by-step play. Wizard: new "3D fold" step on create, "3D fold" section on edit. A change to the lines after the fold was set up marks it stale and blocks saving until it is detected again or removed. A template without a fold stays flat only.
- **Starting 3D view.** `Template.viewSettings` (turn, tilt, zoom, move X/Y, fold amount, all relative to box size; `lib/view-settings.ts`). Admin sets it from the camera icon on each row of the Templates list (dialog) or the "Starting 3D view" section of the edit page; typed numbers move the camera and the camera updates the numbers. Saved separately from the main Save button. The template page, project page and artwork editor start from it, and "reset camera" returns to it. Templates without a saved view keep the old framing.
- **Known limits.** Windows or cut-outs inside a panel show as solid in 3D (a panel is one outline). Detection is a starting point: complex dielines need hand correction. Artwork is anchored per panel on folded templates. Customers still change only overall width and bleed of an imported dieline.

## Ignored lines as an optional "Reference" picture

Ignored line styles stay dropped from geometry, exports and 3D. In the template wizard each ignored style has a "Show as reference" checkbox; the chosen style keys are stored in `geometry.referenceStyles` (checked on save: must be ignored styles). `toFlatDieline(d, roles, referenceStyles)` returns them as thinned `reference` paths (about 1/1500 of the sheet size, 40k point cap); `scaleImportedPaths` (engine) moves them with the same scale as the generated sheet. On the customer's template page (imported templates only, only when reference lines exist) a "Reference" switch, off by default, draws them faint grey on top of the picture. They are not part of downloads.

### Fold list: drag to reorder

- 3D fold step: the fold-lines table is now a list (`hinge-list.tsx`). A grip handle on the far left lets the admin drag a row to change the folding order; other rows slide out of the way (150-180 ms transform, off with reduced-motion), the row settles on drop. Handle also works with ArrowUp/ArrowDown (focus stays on the handle).
- `moveHinge` / `sortedHinges` in `lib/fold-edit.ts`: dropping renumbers steps 1..n; lines that shared a step keep sharing it; a line dropped between two lines of one step joins that step. The Step up/down buttons stay for fine control.
- Verified in headless Chrome with real mouse events (drag to end, keyboard) and 9 unit tests. No new dependency.

### Several pieces on one sheet (box + lid)

- The sheet is now measured from ALL separate closed cut shapes (not only the biggest): width/height, scale corner, cut and bleed boxes, dimension marks, exports. Cut shapes inside another one stay holes/cut-outs. With more than one piece the bleed outline is one box around all of them.
- 3D: `detectFoldSetup` turns every other piece with 2+ panels into an extra part (`FoldSetup.parts`, each with its own base panel). The deepest piece (folded height) is the main body. A single loose panel is still left out with a warning. Max 8 parts.
- Per part the admin sets placement (`FoldPart.placement`): open (tilted by 0..120 degrees about the back edge), closed on top, or beside. `foldTree()` folds each piece alone, then moves the part onto the CLOSED main body; that move is the last 20% of the fold animation. Pieces with parts stand on their base (model3d rotates the sheet normal to up).
- All pieces resize together with the one width. "Make this the main body" swaps main and part; "Make this the base" works inside any piece.
- Not done: each part its own size, bleed outline per piece, glued/hinged lids (lid attached to the box by a fold line is already a normal single piece), parts inside parts.

### Template list page and product image

- `/templates` moved to the `(site)` layout (site header kept, no dashboard sidebar): category list with counts on the left, 3-column card grid on the right.
- Product image: in the 3D view editor (list dialog and template edit page) the admin presses "Save as product image". `CartonView.snapshot({width, height})` renders the box exactly as shown at 900 x 1200 px (PNG); `POST /api/doraadmin/template-product-image` stores it in `storage/templates/<uuid>.png` (`Template.productImageKey`, migration `20261110120000`); `GET /api/templates/[slug]/product-image` serves it to signed-in users. Replace and Remove work; deleting a template removes the file.
- Card layout: dieline on the left (60%), product image on the right (40%, cropped to its middle: the editor draws dashed lines for that part). Without a picture the dieline fills the card.

### Dieline page redesign (template and project pages)

- Same page for `/template/dieline/[slug]` and `/projects/[id]`: top bar (home mark, title, hamburger menu, saved/not-saved cloud, "Design Online", copy-link, "Download the dieline"), a vertical menu on the left (Dielines, Basic, Info, More) with the panel of the chosen item, sheet in the middle, 3D + file formats on the right.
- Hamburger menu: project name (rename), Create new project, My projects, Account, Homepage, Log out, Delete project (edit mode). Add to favorites, Move, Make a copy, AI generations and Language are shown disabled ("Soon"): not built yet.
- "Design Online": creates the project and opens the editor (`createProject` reads `next=editor`); in edit mode it links to the editor, and "Save changes" saves.
- Materials: four families with sub items (`components/dielines/units.ts`): fixed thickness for standard paperboards, editable thickness with a suggested range for flutes and "Custom ..." items. Shown in mm or inch. Thickness feeds the engine; it changes the sheet in Size mode "Inner" (fold allowance = allowanceFactor x thickness), not in "Manufacture". Families/grades outside a template's thickness range are hidden.
- Left menu: Dielines (pick another dieline, loaded on demand by `loadTemplatePicker`), Basic (size, material, thickness, size mode), Info (description, checks), More (structure, print, flaps; only if the template has such fields).
- Info tab ("Dieline info"): Model ID (template id), Dimensions (Manufacturing / Inner / Outer from the allowance rule), statistics (design area with bleed, cut length, crease length); checks and built-in-default notes below, collapsed. Math in `components/dielines/info-math.ts` (tested).

## Cut gap follows board thickness (tuck-end and crash-lock cartons)
- New param `cutGapFactor` (default 1, "Cut gap (x thickness)", Material group). Gap = factor x thickness.
- Each dust flap stops `gap` short of the closure beside it, so a slot of that width separates them; the slot bottom is its own cut segment on the body edge. Closure/tuck keep full width. Crease total drops by the gap per affected dust hinge. Factor 0 = old geometry.
- Crash-lock bottom: the right lock flap also stops one gap short of the back half's outer flap (its hinge is one gap shorter, no zero-width slit there). The tab/lock-flap slits stay zero-width so the glue tab keeps full contact. The closed-bottom coverage check allows the gap area to stay open.
- Slotted (corrugated) box already had thickness-driven slots. Imported SVG templates were unaffected at first; they now follow the thickness too (see docs/board-thickness.md). Slot ends are square, not rounded.

## Default material per template (admin)
- `Template.defaultThickness` (mm, nullable; migration `20261110130000_template_default_thickness`). Set on a built-in template's edit page, Details step, with the same Material menu + thickness field as customers (list in `docs/thickness.md`). Null = the template's own default.
- New projects, the 3D view editor and the template page start with it (`{...preset.defaults, thickness}`); a `?p=` prefill still wins. Server checks it against the generator's thickness range.
- Imported SVG templates have no thickness (fixed geometry), so the field is not shown for them.

## Admin dashboard redesign (light + dark)
- `.admin-shell` palette in `globals.css` (ink-blue accent, deep-ink sidebar in both themes); scoped, so the public site and editor are unchanged.
- `AdminShell` (sidebar drawer on phones, sticky top bar, breadcrumbs, Light / Match system / Dark toggle). Theme is kept in `localStorage["admin-theme"]` and applied as class `dark` on `#admin-root` only; an inline script avoids a light flash.
- Shared `PageHeader`; cards, tables, status pills and notices use tokens or have `dark:` variants. The admin login page still uses the shared auth look.

## SVG Dieline Color (admin setting)
- Settings > "SVG Dieline Color" (`/doraadmin/settings/svg-colors`): any number of hex colours per meaning (Cut, Fold, Bleed, Guide, Ignore), stored in `SiteSetting` key `svg-colors`. A colour can have one meaning only (client moves it, server rejects duplicates).
- Template wizard: a style whose stroke colour is listed gets that role as its starting selection; other colours keep the importer's guess (`colorRoles` in `src/lib/svg-colors.ts`, layered over `suggestRoles`). Saved templates keep their saved roles; the admin can still change any line.
- Matching is by exact stroke colour (case-insensitive), not by dash or width.

## Collapsible admin sidebar
- Footer button collapses the sidebar to a 72px icon rail (labels move to tooltips and screen-reader text). The choice is saved in localStorage `admin-sidebar` and set on #admin-root as `data-sidebar` before first paint, so it persists across pages and reloads until the admin expands it. Phones keep the drawer and ignore it.

## Quick sort for fold order
- 3D fold editor: a Quick sort button turns on a mode where each click on a fold line (or the panel that swings on it) is added to a list. The list sits in a 100 px bar stuck to the bottom of the window (container width); chips can be dragged (or Alt + arrow keys) to reorder, x removes one; a grip at the top centre resizes the bar (drag, arrow keys, double-click resets). Apply numbers those lines 1, 2, 3... (`applyFoldSequence` in `src/lib/fold-edit.ts`); lines not listed follow, keeping their steps.

## 3D view rotation controls
- `RotationControls` (src/components/viewer3d/rotation-controls.tsx): three sliders in the top right corner of a 3D view (collapsed to an icon until opened), X = tilt up/down, Y = turn left/right, Z = roll (a real camera roll: camera.up is rolled and OrbitControls' private _quat/_quatInverse are updated to match, so mouse drags still turn about the screen's vertical; three is pinned at 0.187.0 for this; reset view clears it). They follow the camera while the box is dragged and move it when dragged (`getRotation/setRotation/onRotation` on `CartonViewHandle`). Added to the dieline page preview, the editor 3D preview and the admin fold preview. Not added to the home page hero (decorative) or the admin starting-view editor (already has Turn/Tilt fields).

- Starting 3D view now includes roll (`rollDeg`, old saved views read as 0). Every output starts from the saved view: the dieline page and the editor/project 3D previews take the camera (turn, tilt, roll, zoom, move) from the template; new projects also start at the saved fold amount (`threeD.foldProgress` seeded in createProject).

- The admin 3D fold preview (template edit page) opens with the saved Starting 3D view and follows it at once when it is saved or removed in the "Starting 3D view" section (`startView` state in the wizard, `onSaved` from `ViewSettingsInline`).

- `GridToggle` (src/components/viewer3d/grid-toggle.tsx): icon button in the top left of the dieline-page, editor and admin fold 3D views; shows/hides a floor grid (cells are round mm sizes; `setGridVisible` on `CartonViewHandle`). Off by default.

### Ground panel (which panel is the bottom in 3D)
- `FoldSetup.groundId` / `FoldTree.groundId` (optional; absent = automatic, old behaviour). `buildCartonModel` turns the closed carton so that panel's printed side faces down, keeps the front facing the viewer, and re-centres / re-measures it (`size` follows the turn).
- Admin 3D fold step: "Bottom (on the ground)" select under the 3D preview, plus a "Put this on the ground" button on a selected panel. Saved with the fold (`foldSchema` in template-actions).
- Existing templates are unchanged until a ground panel is chosen. A saved Starting 3D view was set for the old orientation, so set it again after choosing a ground panel.
- Grid toggle also in the admin "Starting 3D view" editor. `CartonView.snapshot` hides the grid while it renders, so the saved product image and downloads never include it.

### Part sizes on the dieline page (imported templates)
- **Dimensions** toggle (sheet toolbar; first called "Show dimensions"): writes each panel's width x height in the panel, in the chosen unit (mm / in). `renderDielineSvg({ showPartSizes })`. The old "Dimensions" toggle (overall sheet width/height lines) is now called "Sheet size".
- **Base width / Base height / Box height** fields next to Width ("Custom size"). Empty = follows the overall width. Only for templates with a 3D fold, one piece (no extra lid parts) that closes along the box axes.
- Engine: `templates/imported-resize.ts` (`planResize`, `sheetMap`). Each gap of the flat sheet along x and y is tagged W (base width), H (base height) or D (box height) from how the panels end up once the box is closed (panel area votes). Every point of the sheet goes through the same piecewise-linear map, so hinges stay on panel edges. Typed sizes must stay within 0.1x..10x of the scaled original.
- Typed sizes are absolute (mm): changing the overall Width afterwards scales everything else but keeps typed sizes. Artwork already placed on the old shape is not re-fitted.

### Watermark on the dieline sheet
- Faint text on the diagonal lattice, drawn only inside the cut outline (`components/dielines/sheet-watermark.tsx`, clipped by the cut loops). On screen only: downloads stay clean.
- Admin setting: Settings > Watermark (`/doraadmin/settings/watermark`): on/off and text (empty = `pacdorabd.com`). Stored in `site_setting` key `watermark` (`lib/watermark-settings.ts`); read per request by the dieline pages (`getWatermarkText`).
- The look is set there too: text colour, line colour, font size (1.5-12 mm) and line thickness (0-2 mm, 0 = no lines), with a live preview and a reset button. The repeat grows with the font size, so bigger text never touches its neighbours.
- **In every download.** When the watermark is on it goes into every file a customer downloads: PDF, AI, EPS, SVG (a "Watermark" layer, text as outlines, solid colours), DXF (layer `WATERMARK`, TEXT + LINE), PNG (editor) and GLB (printed on the outside of the panels, over any artwork). The project JSON is data, not a drawing, so it stays clean. One layout (`layoutWatermark` in dieline-engine) serves all of them: whole texts that fit inside the cut area, lines cut off exactly at the cut line.
- **Skipping it later.** `watermarkSkipped(viewer)` in `server/site-settings.ts` is the one place to decide. Today it is always false. For subscribers return true: `getWatermark(viewer)` then gives null, so the sheet, the export route, the editor and the 3D/PNG downloads all come out clean. The viewer is already passed by the export route and the project and editor pages; the public template dieline page has no viewer yet and needs one when this is turned on.

**Template status (admin).** The "Published" checkbox is now a Status dropdown: Draft, Step 1, Step 2, Step 3, Published, Sealed (`lib/template-status.ts`; `Template.status`, migration `20261111090000_template_status`). Only Published is public: `published` stays as a derived column (`status == "published"`) so public queries and the index are unchanged; every write sets both. Edit page, template list (status filter, badge, per-row select) all use it; new templates start as Draft; old hidden ones became Draft. Step 1-3 and Sealed are labels for the admin's workflow only for now (Sealed does not lock editing).

**Box settings for imported templates (admin).** Imported (SVG) templates now get the same kind of options a built-in carton has. Stored in `FoldSetup.construction` (so it travels with `geometry.fold`; engine `templates/imported-construction.ts`), edited in the admin "3D fold" section (`components/templates-admin/construction-editor.tsx`), everything guessed first:
- Width / Depth / Height: the three stretch sizes (base x, base y, wall height) with a name each (guess: tube cartons = largest is height, others = smallest is height; admin can swap). Optional "starts at" sizes.
- Size mode (manufacture / inner), allowance, board thickness (material picker). The drawing is crease-to-crease; in inner mode sheet = inner + allowance x thickness, so a thicker board grows the sheet and the inside stays. Page params use the built-in keys (`sizeMode`, `thickness`, `allowanceFactor`), so the "Choose material" block appears by itself.
- Flap sizes (tuck depth, glue flap width, dust flap depth): per kind, off until the admin switches it on. A flap kind can be resized only on stretches of the sheet that nothing but flaps of that kind cover (one per-axis map), so dust flaps shorter than the lid cannot be offered. Panel kinds must be right first (auto-detect still calls most small panels "tuck").
- Cut gap factor: stored and shown in the dieline info only; the drawn slots are not reshaped.
- Page "Width" of the whole sheet is now labelled "Sheet width" on templates with box sizes. New projects start with the template's thickness and size mode (`importedStartParams`).

**Admin Users menu with submenus.** "Users" stays the main menu item (heading) with two pages: All Customers (`/doraadmin/users`, signed-up customers only, super admins not listed) and Customer Templates (`/doraadmin/users/templates`, read only list of customers' designs = projects, with customer, template they came from, images, dates; search + template filter). The nav marks only the most specific link as current. Status "Step 3" is now "Hide" (value `hide`, migration `20261111100000_template_status_hide`); like every non-Published status it hides the template from the public site.

**Dieline page header.** Signed-in visitors see their profile icon (account menu: name, Settings, Log out) at the right of the header; the cloud "saved" icon was removed. The template dieline page now reads the session, so `getWatermark(user)` gets a real viewer there too (the subscriber-skip hook works on that page as well).

**My templates (dieline page).** The "Dielines" tab has two sub-tabs: System templates (published, as before) and My templates (the signed-in user's own saved projects, loaded on first open via `loadMyTemplates`, scoped to the session user; search; the open project is highlighted; click opens `/projects/{id}`).

**Customer dashboard `/my-dashboard`** (replaces `/dashboard`, which now redirects; login/register/site header/nav/avatar menu point to the new address). A customer's templates are their projects. The page lists them with search and filters (category, tag), and lets the customer:
- add a system template to their list ("Add from system templates": a dialog of published templates, copies one as a new project with its standard size and material, optionally straight into a category; can be added again),
- make, rename (server action exists) and delete their own categories (one per template, like a folder) and tags (several per template); deleting either keeps the templates,
- assign a category and tags on each card, open, or delete a template.
Data: `user_category`, `user_tag`, `project_tag`, `project.categoryId` (migration `20261111120000_customer_categories_tags`); everything is scoped to the signed-in user in `server/my-templates.ts` and `app/(app)/my-dashboard/actions.ts`; names 1-40 characters, unique per customer, at most 50 categories and 100 tags. Not done: renaming categories/tags in the UI, tag/category use in the "My templates" tab of the dieline page.

**Dashboard reorganised, settings merged in.** `/my-dashboard` has two tabs: My templates and Profile settings (`?tab=profile`). The separate settings page is gone: `/settings` and `/dashboard` are redirects in `next.config.ts`. Profile settings: username (the account name), phone, alternative phone, business name, business address (new nullable columns on `user`, migration `20261111140000_user_profile_fields`; phone checked as digits with optional +, 6-20 characters; empty clears). The admin profile page keeps its own simple form.
My templates is one client component (`components/my-dashboard/dashboard-client.tsx`) holding the customer's latest 300 templates: instant search, sort (recent, oldest, A-Z), grid or list view, filter by category or tag in one tap, filters kept in the address; changes show at once and are saved in the background (put back with a message if saving fails). Per template: Open, Organise (category + tags in a dialog), Delete. Categories and tags can be made, renamed and deleted; duplicate names are refused case-insensitively.

**Home hero shows a chosen template.** Settings > Home page has "Template shown in the 3D view": the default (straight tuck end box, framed for 150 mm as before) or any published template with a 3D view (built-in, or imported with a fold). Stored as `templateId` in the `hero` setting (old values read as default). The home page reads it through `getHeroTemplate` (cached; refreshed when the hero or a template is saved); an imported template's lines and fold are sent to the browser, which builds its box at its standard size and runs the same staged fold. If the template is hidden or loses its 3D view the page falls back to the standard box. The camera frames the sheet by how far it reaches from the base panel. Imported templates fold in the role order of their panels, so correct panel kinds give the nicest sequence.

**SVG clean-up step (import wizard).** New step "Clean up" between "SVG file" and "Customize" (and a "Clean up" section on the edit page). The importer no longer drops anything silently: it keeps every line, gives each path an `id` (document order) and lists the named groups (`ImportedDieline.groups`, from `id` / `inkscape:label` / `data-name`; tool ids like `g12` are skipped). `suggestExclusions` offers whole groups named like a legend / colour key or dimension notes; nothing is removed until the admin approves ("Leave out" per suggestion, or "Approve all"). Manual: click a line, tick a named group, or drag a box (leave out / bring back). `excludePaths(dieline, ids)` drops the paths, re-fits the sheet to the origin and rebuilds styles and suggested roles. Saved as `geometry.dieline` (what everything else reads) plus `geometry.full` and `geometry.excluded` so the edit page can bring parts back. The server redoes the exclusion itself. Templates saved before this have no path ids: the step says to upload the SVG again. Excluded lines are gone for good; the "Ignore" role still keeps lines as an optional reference.
Role heuristics also changed: fill-only shapes are ignored when real strokes exist, and thin neutral-grey dashes are guides when a coloured dashed style (the crease) exists.

**Multi-piece 3D controls.** A sheet with extra pieces (lid, insert) now has a "Pieces" panel in the 3D fold step (`components/templates-admin/pieces-editor.tsx`). Per piece: a name (main body too), "Make this the main body", *Placed against* (any other piece, default the main body; circular chains are refused), *Where it goes* (on top closed / on top open with tilt / **inside** the other piece / **automatic**: inside when it fits, else on top / beside with a side: right, left, front, back), a distance in mm (gap beside, lift above the rim, height above the floor), a position shift X/Y/Z in mm on top of that, and *Folds* together with the main body or after the piece before it. A live line says whether the folded part fits inside the piece it is placed against, with the room to spare or how much too big (`partFits`).
Fold steps are now per piece: each piece has its own list (drag, type a number, tidy and quick sort work inside the piece), a part's step 1 runs with the main body's step 1, and "after" pieces get their own time window (`foldWindows`, `stagedHingeProgress`). Equal step numbers fold together, so the Step column is a typeable number field.
Engine: `PartPlacement` gained `inside`/`auto` modes, `side`, `gap`, `offset`, `relativeTo`; `FoldPart`/`FoldPartSpec` gained `name`, `timing`; `FoldSetup.mainName`. All optional, so saved templates keep working. Server schema in `template-actions.ts` accepts them and the engine validation checks ranges.

**Parts hop over the other piece.** While an extra part moves into place (last 20% of the fold animation) it used to slide in a straight line, through the other piece. It now rises and comes down (`hop` in `PartPlacement`, zero at both ends so the final position is unchanged). Automatic height = just enough to clear the other piece's rim (more for parts that flip over). The Piece placement tab has "Lift while moving mm": empty = automatic, 0 = the old straight slide.
Each extra part also has a **starting position** (`PartPlacement.start`, "Start side / back / up" in the Piece placement tab): a shift in mm from its flat place that applies while the part is flat and while it folds, then eases to nothing as it travels into its final place (final position unchanged).
The starting position also has a side: "Start up in" = Where it lies (default) / Left / Right / Back / Front (`PartPlacement.start.from`). The part starts clear of the piece it is placed against, on that side (measured on the flat sheet, so it holds while the pieces fold), plus the Start side / back / up shifts, then travels to its final place.

**Material & Paper tab.** The box settings of an imported template (sizes, size mode, allowance, cut gap, flaps, board) moved out of their own block under the 3D fold into a "Material & Paper" tab at the end of the fold tab row (`Main body | Part 2 | Piece placement | Material & Paper`; a single-piece template has `Main body | Material & Paper`). The tab opens with the same material menu the customer sees on the dieline page (type, then grade, plus the thickness), already showing the guessed board, with "Use the guessed board" to undo. For folds that cannot have box settings the tab says so.
The material menu is now on **every** imported template, not only those with box settings. Without box settings (two pieces, flat only...) the board is only a label for the material: the engine still exposes a `thickness` parameter (Material group, default the admin's choice or the suggested 0.5 mm / 350g white paperboard) and the drawing does not change. The Material & Paper tab shows the same menu for such folds, already on the suggested board.

**Real sizes for multi-piece templates.** A template with extra pieces (box + lid) used to get only "Sheet width" because `planResize` refused any fold with parts. Now every piece gets its own resize plan (`planPiece`; `ResizePlan.parts`: name, flat box, own plan, `link`). The pieces must lie apart on the sheet (else the old plain scaling). On the dieline page: Width / Depth / Height of the main body (as for a single piece), plus per extra piece `p1_boxHeight` ("<Part> height"), `p1_gap` ("<Part> fit gap": space on each side to the main body, negative = fits inside) and its flaps if the admin enabled them; size mode, board and allowance apply to the lid height as well. The lid's base always follows the main body's base: it keeps the size difference it was drawn with (or `2 x gap` once a gap is typed); the two base sizes are paired the way that needs the smaller change (a lid drawn turned by 90 degrees pairs the other way round). `sheetMap` maps each point with the map of the piece it lies in; a piece that grows or shrinks pushes the pieces to its right and below along, so the gaps between pieces stay. Params of extra piece N are `pN_<size>`; `creaseSizesOf` reads them back for the reference lines. The edit page's Material & Paper tab now shows the box settings (for the main body) for these templates too.

**Piece links (multi-piece sizes are now the admin's choice).** `FoldPartSpec.link` = `{ mode?: "follow" | "own" | "fixed", swap?: boolean }` (absent = follow). The Material & Paper tab has a "Piece links" block (`PieceLinks` in `construction-editor.tsx`): per extra piece a mode and, for follow, a "pair crosswise" tick that flips the guessed pairing of base sizes. follow = base follows the main body's base (drawn difference kept, or a typed fit gap), own height / gap / flaps; own = its own width, depth, height and flaps (`pN_baseWidth` ...), named like a main body's; fixed = no options, only scaled and moved along (`stretchPlanOf` returns no plan). A piece without walls around its base is always fixed. `makeMain` drops the link of the piece that changes role. Server schema and `validateFoldSetup` check the link.

**Help icons on the add/edit page.** Explanatory text on the add/edit page (wizard, 3D fold, Piece placement, Piece links, Material & Paper, Clean up, Starting 3D view, the line-role preview) now sits behind a small help icon (`InfoTip` in `components/templates-admin/help-tip.tsx`: inline, popup placed with `position: fixed` so scrolling panels cannot clip it, closes on a second click, Esc, an outside click or scroll; Esc closes only the tip, not a panel popup behind it). Warnings, errors, counts and measurements stay visible. A new "Piece links" tab (between "Piece placement" and "Material & Paper") holds the per-piece size link choice.

**Keep the 3D view.** Every 3D view with a grid button (`GridToggle`) now also has a lock button under it (`KeepViewToggle`). When on, `CartonView` (`setKeepView`) keeps the camera (rotation x/y/z, zoom, pan) when the model is rebuilt for new geometry: it notes the view against the old box before the rebuild and applies it to the new one (the view is relative to box size), so only the 3D object changes. Off (default): the box is framed from the standard position, as before. The setting lives in the view, not in saved data.

**Save and Save as (dieline page).** The top bar has "Save" and "Save as" (also in the hamburger menu, for small screens). Save: on a saved project it saves the changes (as before); on a template page it creates the project and opens it. Save as: a slide-down dialog asks for a name (suggested "<name> copy"), then `saveProjectAs` keeps the current values as a new project and opens it; the open project is left as it was. A copy keeps the artwork, 3D settings, category and tags, and gets its own copies of the uploaded images. From a template page (nothing saved yet) it simply creates a new project with that name. Both buttons are switched off when the visitor is not signed in (the server also requires an account).
"Save as" also offers the customer's own category (one, a select) and tags (toggle chips): a group is not shown when the customer has none. A saved project's category and tags are preselected; the choice is applied to the new project by `saveProjectAs` (only the customer's own ids are accepted). Without a choice sent, a copy keeps the original's tags. Options come from `getSaveAsOptions` (server/projects.ts).

**Dieline | 3D tabs (dieline page).** A foldable template gets two tabs in the top right corner of the centre area: "Dieline" (default, the sheet) and "3D". "3D" shows the folded box (same fold slider, play and camera controls) filling the centre; the small 3D card in the right column is shown only while "Dieline" is selected, so there is one 3D view at a time. Admin edit page: "Open public page" moved from the page header to the sticky footer, left of "Save changes" (shows "Not published" when the template is not published).

**Board thickness (dieline, cut corners, 3D).** Thickness now moves the fold lines, opens the cut slots at dust-flap corners and draws a real board with rounded folds in 3D; the watermark is on both faces of the 3D box. The rules, the file map, the detection algorithm, the guarding tests, how to check it in the browser, the open items and the mistakes made are all in **`docs/board-thickness.md`**: read it before touching any of this. Owner decision: slot gap = thickness (not a corner clearance). Not built yet: manual cut-corner marking in the admin (offered if some drawing is not detected).
