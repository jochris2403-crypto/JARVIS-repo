# JARVIS Architecture

Sections marked **(planned)** describe the agreed design for phases not yet built. Everything else describes code that exists. [TASKS.md](./TASKS.md) tracks which is which.

## 1. System overview

```
Browser (React SPA)  ──HTTP/JSON──▶  Express API  ──mysql2 pools──▶  MySQL servers
  Zustand stores                      routes → controllers → services
  typed API client                    ConnectionManager, Introspection, Relationships,
        ▲                             QueryCompiler, QueryExecutor
        └──── packages/shared ────────┘
              Zod schemas · types · constants
```

- **The browser never talks to MySQL** and never holds credentials after submitting them. It addresses connections by opaque id.
- **`packages/shared` is the contract.** Request/response shapes are Zod schemas; the server validates input with them and the client validates every response with them. Types are inferred from the schemas, so the two sides cannot drift.
- In development, Vite proxies `/api` to the API, so the browser sees one origin and no CORS is needed. In production the API serves the built web app itself.

## 2. Workspaces

| Package           | Responsibility                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| `apps/web`        | UI only: components, pages, stores, API client                                 |
| `apps/server`     | HTTP API, validation, and (planned) all database access and SQL generation     |
| `packages/shared` | Schemas, types, constants (`WORKSPACES`, error codes, and later the query AST) |

`@jarvis/shared` exports TypeScript source under the `development` condition (used by tsx, Vitest, Vite dev and `tsc`) and compiled JS otherwise, so there is no build step during development.

## 3. Server

```
apps/server/src
├── index.ts          process entry: config, listen, graceful shutdown
├── app.ts            createApp(deps) — pure factory, used by tests via Supertest
├── config/env.ts     Zod-validated environment → ServerConfig
├── routes/           route table (one router per feature)
├── controllers/      HTTP ↔ service translation; no business logic
├── middleware/       request-id, local-only guard, error handler
├── errors/           AppError (code + status + safe message)
└── lib/logger.ts     structured JSON logger with mandatory redaction
```

Also present since Phase 2: `container.ts` (wires the service graph), `services/`, `db/` (connection manager, MySQL error mapping), `introspection/`, `storage/` (connection store), `security/` (secret box). Since Phase 5: `query/` (identifier quoting, QuerySpec compiler, executor).

**Request pipeline:** `helmet` → request id → local-only guard → JSON body parser → API router → error handler.

**Errors.** Code throws `AppError(code, message)`. The error handler turns it into `{ error: { code, message, details?, requestId } }`. Anything that is not an `AppError` is logged in full and returned as a generic `INTERNAL_ERROR` — stack traces and driver messages never reach the client unreviewed.

**Logging.** Every log context passes through `redact()`, which replaces values of keys containing `password`, `secret`, `token`, `key`, `credential`, etc. Logging credentials by accident is therefore not possible through the logger.

## 4. Web app

```
apps/web/src
├── main.tsx               entry
├── app/                   route table, paths, workspace icon map
├── components/ui/         design-system primitives (Button, Dialog, Tooltip, …)
├── components/layout/     AppShell, Sidebar, TopBar, WorkspaceTabs, StatusBar, CommandPalette
├── components/brand/      logo
├── features/<feature>/    feature-specific components (currently: system)
├── pages/                 routed screens
├── stores/                Zustand stores (ui, system, notifications)
├── api/                   typed fetch client + per-feature API modules
├── hooks/ · lib/          shared hooks and utilities
└── styles/index.css       design tokens + Tailwind theme
```

- **Navigation:** React Router. Each workspace is a route (`/overview`, `/schema`, `/relationships`, `/query`, `/data`, `/structure`, `/manage`), defined once in `packages/shared` (`WORKSPACES`) and consumed by the tab bar, command palette, shortcuts and settings page.
- **State:** Zustand. `ui-store` (theme, sidebar; persisted to `localStorage`), `system-store` (API health), `notification-store` (session notification log).
- **API client:** `apiRequest(path, { schema })` validates responses, applies a timeout, and normalises all failures into `ApiClientError` with a machine-readable `code`.
- **Health monitor:** polls `/api/health` (15 s online, 4 s offline), drives the status bar and notifies on connectivity changes.

## 5. Design system

Tokens are CSS variables in `styles/index.css`, mapped into Tailwind v4 via `@theme inline`. Components use only semantic utilities (`bg-surface`, `text-fg-muted`, `border-border-strong`, `text-accent`) — never raw palette colours — so themes are a variable swap.

- **Colour:** dark-first graphite surfaces (`bg` → `surface` → `surface-raised` → `surface-overlay`), one restrained cyan accent, three semantic tones (success, warning, danger). A light theme is provided.
- **Type:** Inter (UI) and JetBrains Mono (data, SQL, identifiers), self-hosted via Fontsource.
- **Scale:** every size is in rem and the root font size is `16px × --ui-scale`, so one preference (Settings → Interface scale: 60 / 70 / 85 / 100%, default 70%) scales text, controls and spacing together. Do not introduce px sizes in components.
- **Shape:** tight radii (3–9px), 1px borders, two elevation levels (`shadow-raised`, `shadow-overlay`).
- **Primitives:** shadcn-style components built on Radix, owned in `components/ui/`: Button, Input, Badge, Kbd, Tooltip, Dialog, DropdownMenu, Popover, Command, Switch, SegmentedControl, Separator, Spinner, StatusDot, EmptyState, Toaster.
- **States:** `EmptyState` is the single pattern for empty/unavailable content. A feature that is not yet available shows an honest empty state, not a disabled or decorative control.

## 6. Connections and schema (Phase 2)

```
ConnectionService ──▶ ConnectionStore   <dataDir>/connections.json, passwords AES-256-GCM encrypted
        │        └──▶ SecretBox         key from JARVIS_SECRET_KEY or <dataDir>/secret.key (0600)
        ├──────────▶ ConnectionManager  one mysql2 pool per open connection id
        └──────────▶ schema-introspector  information_schema → DatabaseSchema
                         └─ relationships   FK constraints → relationships + cardinality
```

- **Profiles vs sessions.** A profile is saved settings; a session is an open pool held by the server process. Several connections can be open; the UI has one _active_ connection and one active database. The browser persists only the active connection id and last-used database names.
- **Pools** (5 connections) return dates and big numbers as strings (no silent rounding or timezone shifts) and have `multipleStatements` disabled.
- **Introspection** runs six parallel `information_schema` queries per database, each with the schema name as a bound parameter, and assembles tables, columns, primary keys (in key order), indexes, foreign keys, routines and triggers. `TABLE_ROWS` is surfaced as `rowEstimate` because InnoDB only estimates it.
- **Relationships** are derived only from declared foreign keys. A relationship is `one-to-one` when its FK columns exactly match a full-column unique index or the primary key of the child table; otherwise `many-to-one`. Inferred (name-based) relationships do not exist yet; when added they will carry a different `source` so they can never be mistaken for constraints.
- **Session loss.** If the server restarts, sessions are gone. The web app reloads profiles whenever the API comes back online and clears a stale active connection; a `NOT_CONNECTED`/`DB_CONNECTION_FAILED` response during use does the same and notifies the user.

## 7. Visual query builder (Phase 5)

```
Builder UI ──QuerySpec──▶ compile endpoint ──▶ compiler ──▶ { sql, params, displaySql } ──▶ SQL preview
     │                                             ▲ validates against cached DatabaseSchema
     └────QuerySpec + executionId──▶ execute ──▶ compiler ──▶ QueryExecutor ──▶ MySQL (prepared statement)
                                     cancel  ──────────────▶ KILL QUERY <thread>
```

- **Editing model vs wire format** (`apps/web/src/features/query/model.ts`). The UI edits a `BuilderState` whose clauses refer to tables by node id, so renaming an alias or removing a table updates every dependent clause. Pure functions transform it; `validate()` reports what is incomplete; `toSpec()` produces the `QuerySpec` only when it is valid.
- **Compiler** (`apps/server/src/query/compiler.ts`). Every table and column must exist in the schema the server introspected; identifiers are emitted only through `quoteIdentifier()`; every literal becomes a `?` parameter. The only values written into SQL text are `LIMIT`/`OFFSET` (schema-validated integers), fixed keywords, and the `GROUP_CONCAT` separator (restricted by the schema to characters safe in a string literal under any SQL mode). `displaySql` inlines escaped values for reading and is never executed.
- **Executor** (`apps/server/src/query/executor.ts`). Runs the statement as a server-side prepared statement on a dedicated pooled connection, so its MySQL thread id is known. Time limit: a `MAX_EXECUTION_TIME` optimizer hint, backed by a server timer that issues `KILL QUERY` (for servers that ignore the hint). Cancel: `KILL QUERY` from a second connection — it stops the statement and keeps the session. Closing the browser tab or aborting the request cancels the query too.
- **Schema cache.** `ConnectionService` keeps the last schema read per connection and database, so the SQL preview compiles on each edit without touching MySQL. It is refreshed whenever the client reloads the schema and dropped on disconnect.
- **Result size.** `LIMIT` is mandatory and capped at 1,000 rows per run; the result panel pages with `OFFSET`. The SQL shown is always exactly what runs — the server never silently rewrites a query.
- **Not implemented** (and not offered in the UI): subqueries, EXISTS, UNION, CASE and other scalar expressions/functions, window functions, CTEs, JSON functions; saving queries and history (Phase 9).

## 8. Relationship diagram (Phase 4)

`apps/web/src/features/erd/` — everything is derived client-side from the `DatabaseSchema` already loaded.

- **`graph.ts` (pure).** `buildGraph()` turns the schema into drawable relationships with an explicit `source`: `foreign-key` (declared constraint), `many-to-many` (two constraints through a detected junction table, when merging is on) or `inferred` (opt-in naming heuristic). `computeHighlight()` works out roles (selected / parent / child / both / connected) and which lines to emphasise for a selection and mode. `joinOrder()` orders a selection so the query builder can join it by foreign key.
- **Junction detection:** exactly two foreign keys to two different tables, whose columns cover the primary key, and no other columns.
- **Inference rules (conservative):** a non-key column with the same name and type as exactly one other table's own single-column primary key, or `<table>_id` matching a table keyed by `id`. Bare `id` columns, primary-key columns, columns already in a foreign key, and ambiguous matches infer nothing. Inferred links are dashed, labelled, explained in the details panel, and never used outside the diagram.
- **`layout.ts`.** dagre, left to right (parents before children); tables without relationships are packed into a grid beneath. Node sizes are computed from column counts (`sizes.ts`, in rem) before rendering, so layout needs no measuring pass.
- **Rendering.** React Flow with a custom table node and relationship edge. Highlight state lives in `erd-store`; each node and edge subscribes to just its own entry, so a selection change re-renders only what changed. Above 60 tables only on-screen elements are rendered, and large schemas start in a compact detail level.
- **Persistence.** View preferences and hand-arranged positions (per connection and database, most recent 20) are kept in `localStorage`. Nothing is written to the database.

## 9. Security model

### Implemented

- API binds to `127.0.0.1` by default.
- **Local-only guard** (`middleware/local-only.ts`): rejects requests whose `Host` is not loopback (DNS-rebinding defence) and requests whose `Origin` is not the configured web origin (CSRF defence for a cookieless local API).
- `helmet` security headers; `x-powered-by` disabled; 2 MB JSON body limit.
- Environment validated at startup; sanitized error responses; redacting logger.
- **Credentials.** A password is sent once over the loopback API, encrypted with AES-256-GCM (random 96-bit IV, connection id bound as additional authenticated data so ciphertext cannot be moved between records), and written to `connections.json` (0600, atomic rename) in the data directory (0700). It is decrypted only inside `ConnectionService` to hand to the driver. No API response contains it; tests assert this at the HTTP, file and browser-storage level.
- **Strict input validation** with shared Zod schemas. Validation errors return paths and messages, never the rejected values.
- **Parameterized metadata queries**; no identifier interpolation anywhere in Phase 2.
- **Connection errors** are translated to actionable messages that name only host and port.
- **No arbitrary SQL.** The query builder sends a typed QuerySpec; the server validates identifiers against the introspected schema, quotes them, and binds every value as a prepared-statement parameter (see §7). Covered by injection tests at the compiler and HTTP level.
- **Query time limit and cancellation** (default 30 s, `JARVIS_QUERY_TIMEOUT_MS`); result size capped per run.

### Limitations of the credential storage (local-development scope)

- The key file lives beside the encrypted data. This protects against casual disclosure (a copied or backed-up `connections.json`, shoulder-surfing a config file), **not** against an attacker who can read the user's home directory. Setting `JARVIS_SECRET_KEY` from a secret manager separates key and data; OS keychain integration is the planned upgrade.
- Decrypted passwords exist in server memory while a pool is open (mysql2 needs them to open new pooled connections).
- Losing the key makes stored passwords unrecoverable; JARVIS reports this and asks for the password to be re-entered.
- The CA certificate and all non-password settings are stored in plain text.

### Planned (design agreed)

- **Destructive operations:** two-step preview → confirm with a server-issued token; affected-row counts shown before execution.
- **Read-only mode:** the per-connection flag is stored and shown today; server-side enforcement lands with the first write operation (Phase 7). It is a safety net, not a privilege system — the MySQL account's grants remain the real boundary.

### Required before multi-user or network exposure

User authentication and sessions, per-user authorization over connections, TLS for the web app and API, a managed secret store (KMS/keychain), CSRF tokens once cookies exist, rate limiting, audit logging, and per-user isolation of saved connections, queries and history. None of this exists today.

## 10. Testing strategy

| Layer           | Tool                           | Scope                                                                          |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Unit            | Vitest                         | Pure logic (shared constants, logger redaction, utils, later the SQL compiler) |
| API integration | Vitest + Supertest             | `createApp()` in-process: routes, errors, security guard                       |
| Component       | Vitest + React Testing Library | The routed app in jsdom with `fetch` stubbed                                   |
| End-to-end      | Playwright                     | Real browser against the real dev stack                                        |

MySQL-backed tests (server integration and end-to-end) run against a project-local MySQL instance created by `npm run db:init` and are skipped when it is not set up. End-to-end tests start their own stack on ports 5183/4320 with a throwaway data directory.
