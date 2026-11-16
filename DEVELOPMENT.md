# Development Guide

## Setup

```bash
nvm use            # or any Node ≥ 22.12
npm install
npm run dev        # API on 127.0.0.1:4310, web on localhost:5173
```

Optional: `cp .env.example .env` to override ports, data directory or log level. `.env` is git-ignored.

## Development database

Tests and local exploration use a **project-local MySQL instance** — its own data directory (`.jarvis-data/mysql`), port **3307** on loopback, and randomly generated credentials. It is independent of any MySQL server already on the machine and never reads or changes it.

```bash
npm run db:init     # one-off: create the instance, a jarvis_dev account and the jarvis_demo schema
npm run db:start    # after a reboot
npm run db:stop
npm run db:seed     # recreate jarvis_demo from scripts/dev-db-seed.sql
```

`db:init` writes the credentials to `.env.test` (git-ignored). Use those values in the New connection dialog to try JARVIS against the demo schema. Requires the `mysqld` and `mysql` binaries (e.g. `brew install mysql@8.0`). Without it, MySQL-backed tests are skipped.

## Daily workflow

1. Make a change.
2. `npm run verify` — typecheck, lint, format check and all unit/integration tests. This must pass before a phase is considered done.
3. `npm run test:e2e` for anything touching user flows. First run only: `npx playwright install chromium`.
4. Update [TASKS.md](./TASKS.md) and [docs/PROGRESS.md](./docs/PROGRESS.md) when meaningful work lands.

Per-workspace commands: `npm run <script> -w @jarvis/web` (or `@jarvis/server`, `@jarvis/shared`).

## Conventions

- **Spec first.** `PROMPT.md` is the source of truth. If a requirement cannot be met, record the limitation in TASKS.md — never fake it in the UI.
- **No placeholder controls.** A button that is rendered must work. Unavailable features use `EmptyState`.
- **No mock data in production code.** Test fixtures live in test files.
- **Contracts in `packages/shared`.** Add a Zod schema there, infer the type, validate on both sides.
- **Server layering:** route → controller → service. Controllers hold no business logic; services do not touch `req`/`res`.
- **Errors:** throw `AppError` with a code from `API_ERROR_CODES`; add new codes to the shared list.
- **Logging:** use the injected `Logger`; never `console.log`. Never log connection configs outside the logger (it redacts).
- **Styling:** semantic token utilities only (`bg-surface`, `text-fg-muted`). No raw palette classes, no inline hex colours in components.
- **Sizes in rem, never px**, so the interface scale applies everywhere. Check new screens at 1366×768 as well as on a large display.
- **Imports:** `@/…` alias inside `apps/web`; relative `.js`-suffixed imports in the server and shared packages (NodeNext).
- **Files** are kebab-case; React components are named exports.

## Adding things

- **A UI primitive:** add to `apps/web/src/components/ui/`, built on Radix where one exists, styled with tokens.
- **An API endpoint:** schema in `packages/shared` → service → controller → register in `apps/server/src/routes/` → document in `docs/API.md` → Supertest test.
- **A workspace screen:** build under `features/<feature>/` and render it from the route in `app/app-routes.tsx`.

## Testing notes

- Web tests render `<AppRoutes />` in a `MemoryRouter` and stub `fetch`; see `app/app-routes.test.tsx`.
- Server tests build the app with `createApp()` and use Supertest — no port is opened.
- MySQL-backed server tests live in `routes/connections.routes.test.ts` under `describe.skipIf(!mysql)`.
- Web tests use `test/fake-api.ts`, an in-memory implementation of the API contract.
- Playwright starts its own stack (web 5183, API 4320, data in `.jarvis-data/e2e`, wiped each run), so it can run while `npm run dev` is up.

## Troubleshooting

- **"Server offline" in the status bar:** the API is not running or port 4310 is taken. The server logs `EADDRINUSE` and exits in that case; change `JARVIS_PORT` in `.env` (the Vite proxy reads `JARVIS_API_URL`).
- **HTTP proxy environments:** if `http_proxy` is set, tools like `curl` may route `localhost` through the proxy and report 503. Use `curl --noproxy '*' …`. The Playwright config already exempts loopback.
- **esbuild install-script warning from npm:** harmless; esbuild works without its postinstall step on supported platforms.
