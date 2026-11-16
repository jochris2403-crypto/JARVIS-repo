# JARVIS — Development Checklist

Source of truth for requirements: [`PROMPT.md`](./PROMPT.md). Legend: `[x]` done and verified · `[~]` in progress · `[ ]` pending.

## Phase 1 — Foundation ✅

- [x] Monorepo (npm workspaces), TypeScript strict, ESLint, Prettier
- [x] Shared contract package (Zod schemas, workspace definitions, error codes)
- [x] API server: config validation, logger with redaction, error handling, security guard, `/api/health`
- [x] Design system: tokens (dark + light), typography, UI primitives
- [x] Application shell: sidebar, top bar, workspace tabs, status bar
- [x] Navigation: routes for 7 workspaces + settings, command palette, keyboard shortcuts
- [x] Notifications: toasts + notification centre
- [x] Settings page (theme, reduced motion, server status, shortcut reference)
- [x] Dev scripts (`dev`, `build`, `start`, `verify`)
- [x] Test infrastructure: Vitest, React Testing Library, Supertest, Playwright
- [x] Documentation: README, ARCHITECTURE, DEVELOPMENT, API, PROGRESS

## Phase 2 — Database Connectivity ✅

- [x] Encrypted local store for connection profiles (AES-256-GCM, key file or `JARVIS_SECRET_KEY`)
- [x] Connection manager: mysql2 pools, connect timeout, SSL options, lifecycle, graceful shutdown
- [x] Endpoints: list, create, update, delete, test, connect, disconnect, databases, schema
- [x] Connection dialog: name, host, port, user, password, default database, SSL (verify + CA), timeout, read-only
- [x] Test connection (unsaved settings, or saved connection with its stored password)
- [x] Sidebar connection list (most recent first) with connect / disconnect / edit / delete
- [x] Delete requires explicit confirmation
- [x] Top bar: active connection switcher, database selector, schema refresh
- [x] Schema introspection: tables, views, columns, primary keys, indexes, foreign keys, routines, triggers
- [x] Relationships derived from foreign keys with one-to-one / many-to-one cardinality
- [x] Overview shows real schema totals and a table list; sidebar Explorer lists tables and views
- [x] Session restore after reload; recovery when the server restarts or a session is lost
- [x] Passwords never returned to or stored in the browser (asserted in tests)
- [x] Project-local MySQL dev instance + demo schema (`npm run db:init`)
- [x] Tests: 55 server (incl. live MySQL), 33 web, 8 end-to-end

## Phase 3 — Schema Explorer (next)

- [ ] Hierarchical tree (tables, views, procedures, functions, triggers)
- [ ] Table/column metadata panels; row counts, engine, sizes
- [ ] Search and filter; context menu; refresh

## Phase 4 — Relationship Visualization ✅

- [x] Interactive ERD (React Flow) built from declared foreign keys; parents left, children right
- [x] Table nodes: name, primary key, foreign-key markers, columns, data types, view / junction badges
- [x] Lines show cardinality (1 → N, 1 → 1, N ↔ N) and are solid for real constraints
- [x] Many-to-many: junction tables detected; optional "Merge junctions" draws one N:N link
- [x] Inferred relationships: opt-in, dashed, labelled "inferred", explained as not enforced; never used for joins
- [x] Zoom, pan, drag, fit, auto layout, full screen (Esc to exit); hand-arranged positions saved per database
- [x] Changing an option (merge junctions, inferred, hide unrelated, highlight, detail) never moves tables or the viewport; only a new database or Auto layout re-arranges
- [x] Minimap removed at the owner's request
- [x] Expand/collapse per table; global detail level (All / Keys / Names), compact by default for large schemas
- [x] Select one or many (click, ⌘/Ctrl-click, Shift-drag box)
- [x] Highlight direct parents and children, all ancestors, all descendants, or everything connected
- [x] Hide unrelated (focus on a selection); search for a table and jump to it
- [x] Details panel: parents, children, columns involved, constraint names, delete rules; click to navigate
- [x] Send selected tables to the Query Builder, ordered so foreign-key joins apply
- [x] Verified on a 300-table / 303-relationship schema: ~0.3 s first paint, 60 fps
- [ ] Self-referencing foreign keys draw as a simple loop (works, not pretty)
- [ ] Foreign keys into another database are listed in the details panel, not drawn

## Phase 5 — Visual Query Builder ✅ (built ahead of Phases 3–4 at the owner's request)

- [x] QuerySpec contract in `packages/shared`; server-side compiler → `{ sql, params, displaySql }`
- [x] Select tables from the sidebar explorer and inside the builder; related tables offered one click away
- [x] Columns: individual, all/none per table, output names (aliases), reorder, DISTINCT
- [x] Joins: INNER / LEFT / RIGHT / CROSS, self joins, multiple and composite conditions, custom operators
- [x] Joins suggested from foreign keys (either direction), editable; join overview strip
- [x] Conditions: all 15 operators, AND/OR, nested groups, value or column comparison, IN lists, BETWEEN
- [x] Aggregates (13 functions, DISTINCT, GROUP_CONCAT separator), GROUP BY, HAVING, aliases
- [x] ORDER BY (columns and aggregates, multiple keys), LIMIT, OFFSET
- [x] Live SQL preview from the server (readable and as-sent views, bound values, copy)
- [x] Run, cancel (`KILL QUERY`), time limit, duration, row count, MySQL error details, result grid, paging
- [x] Tests: compiler (incl. injection attempts), executor timeout/cancel on live MySQL, UI, end-to-end
- [x] Select tables from the relationship diagram (details panel → Add to query)
- [ ] Step 7 advanced operations: subqueries, EXISTS, UNION, CASE, scalar/date/string/math functions, window functions, CTEs, JSON functions — none implemented; the UI says so

## Phase 6 — Data Explorer

- [ ] Server-side pagination, sorting, filtering, search
- [ ] Column visibility/resize/reorder; row selection; record view
- [ ] CSV/JSON export; copy cells

## Phase 7 — Data Management

- [ ] Metadata-driven insert/edit forms; delete; bulk operations
- [ ] Transactions; preview + confirmation with affected-row counts

## Phase 8 — Schema Management

- [ ] Create/rename/drop table; add/modify/rename/drop column
- [ ] Keys, constraints, indexes; SHOW CREATE TABLE
- [ ] SQL preview, destructive-change explanation, explicit confirmation

## Phase 9 — Advanced Features

- [ ] Query history; saved queries with folders; reopen visually
- [ ] Database overview dashboard (real metadata only)
- [ ] Advanced SQL in the query builder: subqueries, EXISTS, UNION, CASE, functions, window functions, CTEs, JSON
- [ ] Performance: code splitting, large-schema handling

## Phase 10 — Quality and Release

- [ ] Coverage review; error-handling audit; security review; performance pass; docs; production build

## Known issues and limitations

- **Relationship diagram:** every line attaches at the middle of a table's left or right edge rather than at the specific column, so several relationships from one table share an anchor point. Lines are not editable — this is a viewer; creating foreign keys is Phase 8. The React Flow attribution badge is left in place (their terms ask for it without a subscription).
- **Inferred relationships** are a naming heuristic and can miss or (rarely) suggest links; they are off by default and never treated as constraints.

- **Query builder:** results are capped at 1,000 rows per run (page with OFFSET). No expressions or functions other than aggregates. HAVING can test aggregates and grouped columns only. The draft is not saved — it is lost on reload or when switching database (saved queries are Phase 9).
- **Query builder with strict SQL mode:** selecting a non-grouped column beside an aggregate is flagged with a warning and a one-click fix, but not blocked; MySQL's own error is shown if it is run.
- A cancel that arrives in the instant a query finishes is ignored by design (so it can never hit the connection's next statement).

- **Read-only flag is not enforced yet** because JARVIS has no write operations yet. It is stored and displayed; server-side enforcement must land with the first write endpoint (Phase 7).
- Only SSL with optional CA verification is supported. Client certificates (mutual TLS), SSH tunnels and Unix-socket connections are not.
- The sidebar Explorer is a flat table/view list; the hierarchical tree, search and context menus are Phase 3.
- Row counts are InnoDB estimates (labelled as such), not exact counts.
- Schema metadata is fetched whole per database. Fine for hundreds of tables; very large schemas (thousands of tables) may need lazy loading.
- MySQL-compatible servers (MariaDB, etc.) are untested; queries avoid MySQL-8-only `information_schema` columns.
- Web bundle is one ~900 kB chunk (React Flow and dagre added); split by route when the ERD and data grid land.
- Server version is duplicated in `apps/server/package.json` and `src/version.ts`.

## Technical decisions

| Decision                                                                 | Reason                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript 6.0 rather than 7.0                                           | `typescript-eslint` 8 supports TS `<6.1`; revisit when it supports 7.                                                                |
| Tailwind v4 with CSS-variable tokens                                     | Themes become a variable swap; components use semantic utilities only.                                                               |
| shadcn-style components owned in-repo, on the unified `radix-ui` package | Full control over the design system; no generated-code drift.                                                                        |
| React Router for workspaces                                              | Deep-linkable, back/forward works, one route per workspace.                                                                          |
| `react-router` pinned to 7.x                                             | The spec's stack predates 8; no reason to adopt a new major mid-foundation.                                                          |
| Vite dev proxy for `/api` (no CORS)                                      | Single origin for the browser; simplifies the security guard.                                                                        |
| Host/Origin guard instead of auth for v1                                 | Local single-user tool; blocks DNS rebinding and cross-site requests. Auth is documented as a prerequisite for any network exposure. |
| Server bundled with esbuild                                              | Inlines `@jarvis/shared`; keeps npm dependencies external.                                                                           |
| Alt+digit for workspace switching                                        | Cmd/Ctrl+digit is reserved by browsers for tab switching.                                                                            |
| React Flow, TanStack Table, mysql2 not yet installed                     | Added in the phases that use them, to avoid unused dependencies.                                                                     |
| No git commits made by the assistant                                     | Commits are left to the project owner unless requested.                                                                              |

## Open questions for the project owner

None blocking. (The Phase 1 question about database access is resolved by the project-local dev instance.)
