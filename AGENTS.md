# Repository Guidelines

## Project Structure & Module Organization

This npm-workspace monorepo contains reusable TypeScript packages in `packages/*` and the Next.js product in `apps/web`.

- `packages/dieline-engine` owns validated packaging geometry and templates; renderer, artwork, 3D, schema, and import packages build on that domain.
- Package implementation lives in `src/`; colocated Vitest tests live in `test/` (for example, `packages/render-svg/test/svg.test.ts`).
- `apps/web/src/app` contains App Router routes, `components/` contains feature and UI components, and `lib/` and `server/` contain shared/client-safe and server logic respectively.
- Prisma schema, migrations, and seed scripts are in `apps/web/prisma`; infrastructure lives in `infra`; design and operational notes are in `docs/` and `how-to/`.

## Build, Test, and Development Commands

Run these from the repository root:

```bash
npm install                 # install workspace dependencies
npm run dev                 # start Next.js at http://localhost:3100
npm test                    # run package and web Vitest suites
npm run typecheck           # type-check packages and viewer
npm run lint -w web         # lint the web application
npm run db:up               # start local Postgres and Mailpit
npm run db:migrate && npm run db:seed
```

Use `npm run viewer` for the standalone dieline/3D development viewer. Copy `apps/web/.env.example` to `.env.local`; never commit secrets.

## Coding Style & Naming Conventions

Use TypeScript with strict types and the existing two-space indentation, double quotes, and semicolons. Prefer explicit domain types and small pure functions in packages. Name React components in `PascalCase`, hooks as `useThing`, and general modules/functions in descriptive `camelCase`; use kebab-case filenames such as `camera-view-menu.tsx`. Keep geometry code free of DOM/React dependencies. Run ESLint for web changes rather than introducing another formatter.

## Testing Guidelines

Vitest discovers `packages/*/test/**/*.test.ts` plus web tests in `apps/web/src/lib` and `components`. Add regression tests beside the affected package or feature, using `*.test.ts` names. Exercise validation boundaries and generated geometry; randomized property tests are already part of the suite. Run `npm test` and `npm run typecheck` before requesting review.

## Commit & Pull Request Guidelines

Recent history uses short imperative summaries (for example, `Added Split column`); write a focused subject describing the visible change. Keep commits scoped. PRs should explain intent and testing, link relevant issues, call out schema/environment changes, and include screenshots or a short recording for UI work. Do not overwrite unrelated in-progress changes.
