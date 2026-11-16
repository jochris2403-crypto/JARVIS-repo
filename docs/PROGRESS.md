# Development Progress

A dated log of what was built and verified. The checklist view is in [TASKS.md](../TASKS.md).

## 2026-11-17 — Phase 4: Relationship Visualization ✅ (and a denser interface)

**Interface scale, again.** The owner still found the UI too large at 85%. The default is now 70% (options 60 / 70 / 85 / 100%), and scales saved by earlier versions are reset to it once.

**Built**

- Pure graph model: relationships from foreign keys, junction-table detection, opt-in inferred relationships, highlight roles, join ordering; dagre-based layout with a grid for unrelated tables.
- React Flow diagram with custom table nodes and relationship lines (cardinality markers, solid vs dashed), minimap, controls, legend.
- Toolbar: find table, detail level, highlight mode, hide unrelated, merge junctions, show inferred, auto layout, fit.
- Details panel for one or many selected tables; "Add to query" hands the selection to the Query Builder.
- Demo schema gained `SupportTickets`, which refers to contacts by column name only (no foreign key), to exercise inference honestly.

**Verified**

- `npm run verify` clean: 162 tests (shared 3, server 84, web 75).
- `npm run test:e2e`: 20 Playwright tests; 9 cover the diagram against real MySQL (roles, highlight modes, focus, search, inferred, many-to-many, collapse, saved positions, hand-off to the query builder).
- Measured on a generated 300-table / 303-relationship database: first paint ≈ 0.3 s, find-and-select ≈ 0.35 s, 60 fps idle.

**Found and fixed during verification**

- Inference matched a table's own primary key to a one-to-one extension table keyed by the same column. Primary-key columns are now never inferred, extension tables are not candidate parents, and ambiguous matches infer nothing.
- Column labels on highlighted lines piled up where lines fan out; they now appear only on inferred, many-to-many and selected-to-selected links.

## 2026-11-17 — Phase 5: Visual Query Builder ✅ (and interface scale)

Built before Phases 3–4 because the owner asked for interactive querying next.

**Interface scale.** The owner reported the UI as too large. All sizes are now rem-based and scale with a single preference (75 / 85 / 100 / 115%, default 85%), in Settings and the top-bar menu.

**Built**

- **Shared:** `QuerySpec`, condition tree, aggregates, result and cell schemas.
- **Server:** identifier quoting; QuerySpec → SQL compiler validated against the schema; `QueryExecutor` (prepared statements, time limit, `KILL QUERY` cancel, typed cells); schema cache; compile / execute / cancel endpoints.
- **Web:** pure builder model with validation; query store with debounced server compilation; five builder steps (tables & joins, columns, filters, summarize, sort & limit); SQL preview; results grid with paging; add-to-query from the sidebar explorer; ⌘/Ctrl+Enter to run.

**Verified**

- `npm run verify` clean: 135 tests (shared 3, server 84, web 48).
- `npm run test:e2e`: 11 Playwright tests, including the specification's nested-condition example built visually, GROUP BY/HAVING, and cancelling a 268-million-row query from the UI.
- Screenshots reviewed at 1440×900 and 1366×768.

**Found and fixed during verification**

- The document was taller than the window, so scrolling a control into view could shift the whole app frame; the frame is now fixed to the viewport.
- `COUNT(*)`/`BIGINT` came back as text; safe integers are now numbers (oversized ones and DECIMAL stay text).
- Result headers showed wire-protocol type names (`longlong`); mapped to SQL names.

**Not done / carried forward**

- Step 7 advanced SQL, table selection from the diagram, saved queries/history.

## 2026-11-17 — Phase 2: Database Connectivity ✅

**Built**

- **Shared:** connection and database-schema contracts (Zod), `NOT_CONNECTED` error code.
- **Server:** `SecretBox` (AES-256-GCM) and key management; `ConnectionStore` (atomic, 0600 JSON file); `ConnectionManager` (mysql2 pools); MySQL error translation; `information_schema` introspection; FK-based relationship derivation with cardinality; `ConnectionService`; nine `/api/connections` endpoints; service container; pools closed on shutdown.
- **Web:** connections API module and store; connection dialog with validation and Test connection; sidebar connection list with actions and delete confirmation; top-bar connection and database switchers with schema refresh; sidebar Explorer list; Overview schema totals and table list; command-palette connection commands; session restore and session-loss handling.
- **Tooling:** `scripts/dev-db.sh` — an isolated MySQL instance on port 3307 with a seeded demo schema covering one-to-many, one-to-one, many-to-many, composite keys, a view, a trigger and a function.
- `PROMPT.md` moved into the project root.

**Verified**

- `npm run verify` clean: 91 tests (shared 3, server 55, web 33). Server tests include live-MySQL coverage of connect/test/disconnect, wrong credentials, every part of introspection, and a hostile database name.
- `npm run test:e2e`: 8 Playwright tests, including a full connect → schema → reload → switch database → disconnect flow against real MySQL, asserting the password never appears in any API response or browser storage.
- Screenshots reviewed for the dialog and the connected Overview.

**Found and fixed during verification**

- E2E data directory was resolved relative to the server's working directory, so it was not wiped between runs.
- Test-connection result was hidden below the scroll fold when SSL options were expanded; moved next to the buttons.

**Not done / carried forward**

- Read-only enforcement (no write operations exist yet), client certificates, SSH tunnels.
- Hierarchical explorer, search and metadata panels (Phase 3).

## 2026-11-17 — Phase 1: Foundation ✅

**Built**

- npm-workspaces monorepo: `apps/web`, `apps/server`, `packages/shared`; TypeScript strict everywhere; ESLint (flat config) and Prettier.
- **Shared:** workspace definitions, API error contract, health schema.
- **Server:** Express 5 app factory, validated env config, redacting JSON logger, `AppError` + sanitizing error handler, request ids, local-only (Host/Origin) guard, `GET /api/health`, production static serving with SPA fallback, graceful shutdown.
- **Design system:** token-based dark/light themes, 16 UI primitives on Radix, logo.
- **Shell:** collapsible sidebar (Connections, Explorer, Saved queries, Recent activity, Settings), top bar (connection context, search, notification centre, settings menu), workspace tab bar for the seven workspaces, status bar with live server status, command palette, global keyboard shortcuts, toasts, settings page, not-found page.
- **Working screens:** Overview shows live server facts from the API; Settings changes theme and motion preferences (persisted); every workspace route renders with an honest "no connection" state.

**Verified**

- `npm run verify`: typecheck, lint, format — clean; 36 unit/integration tests pass (shared 3, server 12, web 21).
- `npm run test:e2e`: 5 Playwright tests pass in Chromium against the live dev stack.
- `npm run build` succeeds.
- Visual check of dark and light themes via screenshots.

**Found and fixed during verification**

- Express 5 reports listen errors through the `listen` callback; the server logged "listening" before failing on `EADDRINUSE`.
- Radix `Slot` stringifies function-style `className`, which broke the active state of workspace tabs wrapped in tooltips.
- Self-referencing shadow tokens in the Tailwind theme.
- Playwright's readiness probe went through the machine's HTTP proxy; loopback is now exempted.

**Not done / carried forward**

- No database functionality of any kind yet (Phase 2 starts it).
- Web bundle is a single ~580 kB chunk (179 kB gzip); route-level code splitting is scheduled with the heavy workspaces (ERD, data grid).
- React Flow and TanStack Table are intentionally not installed until the phases that use them.
