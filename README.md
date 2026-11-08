# Packaging design platform

Original, Pacdora-inspired packaging design tool. See `docs/PLAN.md` for the full plan and `docs/dieline-math.md` for the geometry.

## Status

**Done:** dieline engine (tuck-end carton), SVG renderer, 3D folding + dev viewer, and Phase 1 web foundation
(Next.js 16 app, PostgreSQL + Prisma, email/password auth with email confirmation and password reset,
Google sign-in (needs your OAuth keys), Cloudflare Turnstile captcha, rate limiting, dashboard, settings).
Template library, template designer with live dieline preview, and projects (create / edit / delete).
Not built yet: more box types, 2D artwork editor, 3D in the app, exports other than SVG, AI.

## Run (npm workspaces, Node 22)

One-time setup:

```bash
brew install colima docker docker-compose   # Docker runtime (already done on this Mac)
colima start                                # start the Docker VM (after each reboot)
npm install
npm run db:up                               # Postgres 18 (127.0.0.1:5433) + Mailpit (http://127.0.0.1:8025)
cp apps/web/.env.example apps/web/.env.local   # then set BETTER_AUTH_SECRET: openssl rand -base64 32
npm run db:migrate && npm run db:seed      # create tables + template catalogue (re-run db:seed after new templates)
npm run dev                                 # web app: http://localhost:3100
```

All emails (confirmation, password reset) appear in Mailpit at http://127.0.0.1:8025 during development.
The captcha uses Cloudflare's public test keys locally (always passes); real keys are needed in production.
Google sign-in appears only after you set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in apps/web/.env.local.

Engine tools:

```bash
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
