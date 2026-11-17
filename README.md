# JARVIS

**Just A Relational Visualization & Interactive SQL** — a web-based visual environment for exploring and managing MySQL databases without writing SQL by hand.

> **Status: Phases 1, 2, 4 and 5 complete.** You can connect to MySQL, explore a database as an interactive relationship diagram, and build, preview and run SELECT queries visually — joins, nested AND/OR filters, aggregates, grouping, sorting and paging — without typing SQL. The schema explorer tree, data editing and structure management are not built yet and say so in the UI. See [TASKS.md](./TASKS.md).

The product specification lives in [`PROMPT.md`](./PROMPT.md) and is the source of truth.

## Requirements

- Node.js ≥ 22.12 (developed on 24 LTS; see `.nvmrc`)
- npm ≥ 10
- A MySQL 8.0+ server to connect to (MySQL-compatible servers should work but are untested)

## Quick start

```bash
npm install
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://127.0.0.1:4310/api/health>

To try it against a ready-made demo schema, run `npm run db:init` and use the credentials it writes to `.env.test` (see [DEVELOPMENT.md](./DEVELOPMENT.md#development-database)).

Configuration is optional; copy `.env.example` to `.env` to change ports or the data directory.

## Scripts

| Command                                    | What it does                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run dev`                              | Starts the API (tsx watch) and web app (Vite) together                             |
| `npm run build`                            | Builds shared → server → web for production                                        |
| `npm start`                                | Runs the built server; with `NODE_ENV=production` it also serves the built web app |
| `npm run verify`                           | Typecheck + lint + format check + unit/integration tests                           |
| `npm test`                                 | Vitest across all workspaces                                                       |
| `npm run test:e2e`                         | Playwright end-to-end tests (first run: `npx playwright install chromium`)         |
| `npm run db:init` / `db:start` / `db:stop` | Project-local MySQL dev instance on port 3307                                      |
| `npm run lint` / `npm run format`          | ESLint / Prettier                                                                  |

## Repository layout

```
apps/web         React + Vite + Tailwind frontend
apps/server      Express API (the only process that talks to MySQL)
packages/shared  Zod schemas, types and constants shared by both
e2e              Playwright tests
docs             API reference and progress log
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design, security model, design system
- [DEVELOPMENT.md](./DEVELOPMENT.md) — workflow, conventions, testing
- [DEPLOYMENT.md](./DEPLOYMENT.md) — hosting JARVIS for access from other machines
- [docs/API.md](./docs/API.md) — HTTP API reference
- [docs/PROGRESS.md](./docs/PROGRESS.md) — development log
- [TASKS.md](./TASKS.md) — checklist, known issues, technical decisions

## Security notice

By default JARVIS runs on your own machine, bound to `127.0.0.1`, with no login. To open it from other machines, set `JARVIS_AUTH_PASSWORD`: this turns on a sign-in screen, and JARVIS refuses to listen on a network interface without it. It is a single shared account, not multi-user access control. See [DEPLOYMENT.md](./DEPLOYMENT.md). Connection passwords are encrypted at rest in `~/.jarvis`, with the limitations described in the architecture document. See the security section of [ARCHITECTURE.md](./ARCHITECTURE.md) for what is required before multi-user or internet deployment.
