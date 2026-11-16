# JARVIS HTTP API

Base URL: `http://127.0.0.1:4310/api` (proxied as `/api` by the web dev server).

All request and response bodies are JSON. Schemas are defined in `packages/shared/src/schemas` and are authoritative.

## Conventions

- Every response carries an `X-Request-Id` header.
- Requests must be addressed to a loopback `Host`, and any `Origin` header must match the configured web origin; otherwise the API answers `403 FORBIDDEN`.

### Errors

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No API route for GET /nope",
    "details": null,
    "requestId": "3f0c…"
  }
}
```

`details` and `requestId` are optional. Clients must branch on `code`.

| Code                    | HTTP | Meaning                                           |
| ----------------------- | ---- | ------------------------------------------------- |
| `BAD_REQUEST`           | 400  | Malformed request (e.g. invalid JSON)             |
| `VALIDATION_FAILED`     | 422  | Body/params failed schema validation              |
| `NOT_FOUND`             | 404  | Unknown route or resource                         |
| `CONFLICT`              | 409  | State conflict                                    |
| `FORBIDDEN`             | 403  | Rejected by the local-only guard or policy        |
| `READ_ONLY`             | 403  | Write attempted on a read-only connection         |
| `CONFIRMATION_REQUIRED` | 428  | Destructive operation needs explicit confirmation |
| `NOT_CONNECTED`         | 409  | The connection has no open session on the server  |
| `DB_CONNECTION_FAILED`  | 502  | Could not reach or authenticate with MySQL        |
| `DB_QUERY_FAILED`       | 400  | MySQL rejected the statement                      |
| `QUERY_TIMEOUT`         | 504  | Query exceeded its time limit                     |
| `QUERY_CANCELLED`       | 409  | Query was cancelled by the user                   |
| `INTERNAL_ERROR`        | 500  | Unexpected server error (details are logged only) |

`READ_ONLY` and `CONFIRMATION_REQUIRED` are reserved for upcoming phases and are not produced yet.

`VALIDATION_FAILED` carries `details.issues: [{ path, message }]` — never the rejected values. Database errors carry `details: { mysqlCode, errno }`.

## Endpoints

### `GET /health`

Liveness and version of the API process. Response `200`, `Cache-Control: no-store`:

```json
{
  "status": "ok",
  "name": "JARVIS",
  "version": "0.1.0",
  "uptimeSeconds": 42,
  "nodeVersion": "v24.22.3",
  "serverTime": "2026-11-17T00:00:00.000Z"
}
```

## Connections

A **connection profile** is a saved set of MySQL settings. The password is write-only: it is accepted on create/update/test and never returned.

```jsonc
// ConnectionProfile
{
  "id": "7b0c6a52-…",
  "name": "Local dev",
  "host": "127.0.0.1",
  "port": 3306,
  "user": "app",
  "database": "shop", // optional default database
  "ssl": { "enabled": false, "rejectUnauthorized": true, "ca": "-----BEGIN…" /* optional */ },
  "connectTimeoutMs": 10000, // 1000–120000
  "readOnly": false,
  "hasPassword": true,
  "createdAt": "…",
  "updatedAt": "…",
  "lastConnectedAt": "…" /* or null */,
  "connected": true, // the server holds an open pool
  "serverVersion": "8.0.45", // null when not connected
}
```

| Method & path                                     | Body                                 | Response                                                | Notes                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /connections`                                | —                                    | `{ connections: Profile[] }`                            |                                                                                                                                                 |
| `POST /connections`                               | settings + `password`                | `201` Profile                                           | `409 CONFLICT` on duplicate name (case-insensitive)                                                                                             |
| `PUT /connections/:id`                            | settings + optional `password`       | Profile                                                 | Omitted password keeps the stored one; `""` clears it. Closes the open session if host, port, user, database, SSL, timeout or password changed. |
| `DELETE /connections/:id`                         | —                                    | `{ deleted: true }`                                     | Closes the session first. Changes nothing on the MySQL server.                                                                                  |
| `POST /connections/test`                          | settings + optional `password`, `id` | `{ ok, serverVersion, authenticatedAs, latencyMs }`     | Does not save. With `id` and no password, the stored password is used. `502 DB_CONNECTION_FAILED` with an actionable message on failure.        |
| `POST /connections/:id/connect`                   | —                                    | Profile (`connected: true`)                             | Opens a verified pool, replacing any existing one.                                                                                              |
| `POST /connections/:id/disconnect`                | —                                    | Profile (`connected: false`)                            | Idempotent.                                                                                                                                     |
| `GET /connections/:id/databases`                  | —                                    | `{ databases: [{ name, charset, collation, system }] }` | `409 NOT_CONNECTED` if not open.                                                                                                                |
| `GET /connections/:id/databases/:database/schema` | —                                    | `DatabaseSchema`                                        | `404` if the database does not exist.                                                                                                           |

"settings" = `name`, `host`, `port`, `user`, `database?`, `ssl`, `connectTimeoutMs`, `readOnly`.

### `DatabaseSchema`

```jsonc
{
  "database": "shop",
  "tables": [{
    "name": "orders", "type": "table" /* or "view" */, "engine": "InnoDB",
    "rowEstimate": 1200,   // InnoDB statistics estimate, not an exact count; null for views
    "dataBytes": 16384, "indexBytes": 16384, "collation": "…", "comment": "", "createdAt": "…",
    "columns": [{ "name", "position", "dataType", "columnType", "nullable", "defaultValue",
                  "isPrimaryKey", "autoIncrement", "generated", "extra", "comment",
                  "charMaxLength", "numericPrecision", "numericScale" }],
    "primaryKey": ["order_id", "region_code"],   // in key order
    "indexes": [{ "name", "unique", "primary", "type", "columns": [{ "name", "subPart" }] }],
    "foreignKeys": [{ "name", "columns", "referencedSchema", "referencedTable",
                      "referencedColumns", "onUpdate", "onDelete" }]
  }],
  "relationships": [{
    "id": "fk:orders:fk_order_customer", "source": "foreign-key", "constraintName": "…",
    "fromTable": "orders", "fromColumns": ["customer_id"],          // child
    "toSchema": "shop", "toTable": "customers", "toColumns": ["id"], // parent
    "cardinality": "many-to-one",   // "one-to-one" when the FK columns are unique in the child
    "onUpdate": "NO ACTION", "onDelete": "CASCADE"
  }],
  "routines": [{ "name", "type": "procedure" | "function" }],
  "triggers": [{ "name", "table", "timing", "event" }],
  "loadedAt": "…"
}
```

Relationships come only from declared `FOREIGN KEY` constraints (`source: "foreign-key"`). Nothing is inferred from column names.

## Visual queries

The query builder never sends SQL. It sends a **QuerySpec** (schema: `packages/shared/src/schemas/query.ts`); the server validates it against the introspected schema and compiles it. There is no endpoint that accepts SQL text.

| Method & path                                             | Body                                      | Response                                                |
| --------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `POST /connections/:id/databases/:database/query/compile` | `QuerySpec`                               | `{ sql, params, displaySql }` — nothing is executed     |
| `POST /connections/:id/databases/:database/query/execute` | `{ query: QuerySpec, executionId: uuid }` | `QueryResult`                                           |
| `POST /query-executions/:executionId/cancel`              | —                                         | `{ cancelled: boolean }` (`false` if it is not running) |

```jsonc
// QuerySpec
{
  "distinct": false,
  "from": { "table": "ContactDetails", "alias": "c" },
  "joins": [{ "type": "inner" | "left" | "right" | "cross", "table": "ContactPhones", "alias": "p",
              "on": [{ "left": { "table": "c", "column": "contact_id" }, "operator": "eq",
                       "right": { "table": "p", "column": "contact_id" } }] }],   // empty for cross
  "select": [                                   // empty = SELECT *
    { "kind": "column", "column": { "table": "c", "column": "first_name" }, "alias": "Name" },
    { "kind": "aggregate", "aggregate": { "fn": "COUNT", "column": null, "distinct": false }, "alias": "n" }
  ],
  "where":  { "kind": "group", "op": "and" | "or", "items": [ /* conditions and nested groups */ ] } | null,
  "groupBy": [{ "table": "c", "column": "first_name" }],
  "having": { /* same shape as where; left side may be an aggregate */ } | null,
  "orderBy": [{ "expr": { "kind": "column" | "aggregate", … }, "direction": "asc" | "desc" }],
  "limit": 100,      // 1–1000
  "offset": 0
}

// Condition
{ "kind": "condition", "left": { "kind": "column", "column": {…} }, "operator": "eq",
  "right": { "kind": "value", "value": "ACTIVE" } }          // or { "kind": "column", "column": {…} }
// in / notIn use "values": […];  between / notBetween use "range": [a, b];  isNull / isNotNull take nothing.
```

Operators: `eq neq gt gte lt lte like notLike regexp in notIn between notBetween isNull isNotNull`.
Aggregates: `COUNT SUM AVG MIN MAX GROUP_CONCAT STDDEV_POP STDDEV_SAMP VAR_POP VAR_SAMP BIT_AND BIT_OR BIT_XOR` (`distinct` where MySQL allows it; `separator` for `GROUP_CONCAT`).

```jsonc
// QueryResult
{
  "sql": "SELECT … WHERE `c`.`status` = ?", // exactly what was sent
  "displaySql": "SELECT … WHERE `c`.`status` = 'ACTIVE'", // for reading; never executed
  "columns": [
    {
      "name": "Name",
      "table": "c" /* alias, or null if computed */,
      "dataType": "varchar",
      "numeric": false,
    },
  ],
  "rows": [["Asha"], [null]], // arrays, so duplicate column names are preserved
  "rowCount": 2,
  "durationMs": 3,
  "limit": 100,
  "offset": 0,
}
```

Cell values: numbers are numbers when exactly representable; `DECIMAL`, out-of-range `BIGINT`, dates and times are strings; JSON columns are JSON text; binary data is `{ "binary": "<hex of first 24 bytes>", "bytes": <length> }`.

Errors: `422 VALIDATION_FAILED` (unknown table/column, malformed spec), `400 DB_QUERY_FAILED` (MySQL rejected it; `details.mysqlCode`), `504 QUERY_TIMEOUT`, `409 QUERY_CANCELLED`, `409 NOT_CONNECTED`. A request aborted by the client cancels its query.

_Data and structure endpoints are added — and documented here — as their phases land._
