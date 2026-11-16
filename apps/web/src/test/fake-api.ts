import type {
  ColumnInfo,
  ConnectionCreateInput,
  ConnectionProfile,
  DatabaseSchema,
  HealthResponse,
  QueryResult,
  QuerySpec,
  TableInfo,
} from '@jarvis/shared';
import { vi } from 'vitest';

export const HEALTH: HealthResponse = {
  status: 'ok',
  name: 'JARVIS',
  version: '0.1.0',
  uptimeSeconds: 125,
  nodeVersion: 'v24.0.0',
  serverTime: '2026-01-01T00:00:00.000Z',
};

function column(name: string, columnType = 'varchar(80)', isPrimaryKey = false): ColumnInfo {
  return {
    name,
    position: 1,
    dataType: columnType.replace(/[ (].*/, ''),
    columnType,
    nullable: !isPrimaryKey,
    defaultValue: null,
    isPrimaryKey,
    autoIncrement: isPrimaryKey,
    generated: false,
    extra: '',
    comment: '',
    charMaxLength: null,
    numericPrecision: null,
    numericScale: null,
  };
}

function table(name: string, overrides: Partial<TableInfo> = {}): TableInfo {
  return {
    name,
    type: 'table',
    engine: 'InnoDB',
    rowEstimate: 4,
    dataBytes: 16384,
    indexBytes: 16384,
    collation: 'utf8mb4_0900_ai_ci',
    comment: '',
    createdAt: '2026-01-01 00:00:00',
    columns: [column('id', 'int unsigned', true)],
    primaryKey: ['id'],
    indexes: [],
    foreignKeys: [],
    ...overrides,
  };
}

export const DEMO_SCHEMA: DatabaseSchema = {
  database: 'shop',
  tables: [
    table('customers', {
      columns: [column('id', 'int unsigned', true), column('name'), column('country', 'char(2)')],
    }),
    table('orders', {
      columns: [
        column('id', 'int unsigned', true),
        column('customer_id', 'int unsigned'),
        column('total', 'decimal(10,2)'),
      ],
      foreignKeys: [
        {
          name: 'fk_order_customer',
          columns: ['customer_id'],
          referencedSchema: 'shop',
          referencedTable: 'customers',
          referencedColumns: ['id'],
          onUpdate: 'NO ACTION',
          onDelete: 'CASCADE',
        },
      ],
    }),
    table('recent_orders', {
      type: 'view',
      engine: null,
      rowEstimate: null,
      dataBytes: null,
      indexBytes: null,
    }),
  ],
  relationships: [
    {
      id: 'fk:orders:fk_order_customer',
      source: 'foreign-key',
      constraintName: 'fk_order_customer',
      fromTable: 'orders',
      fromColumns: ['customer_id'],
      toSchema: 'shop',
      toTable: 'customers',
      toColumns: ['id'],
      cardinality: 'many-to-one',
      onUpdate: 'NO ACTION',
      onDelete: 'CASCADE',
    },
  ],
  routines: [],
  triggers: [],
  loadedAt: '2026-01-01T00:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

export interface FakeApi {
  /** Every request made, for asserting on what was (and was not) sent. */
  requests: { method: string; path: string; body: unknown }[];
  profiles: ConnectionProfile[];
  /** Passwords the fake accepts when testing/connecting. Anything else is "access denied". */
  validPassword: string;
  online: boolean;
  /** What `query/execute` answers with. Tests may replace it. */
  queryResult: Omit<QueryResult, 'sql' | 'displaySql' | 'limit' | 'offset'>;
  /** When set, `query/execute` fails with this error instead. */
  queryError: { status: number; code: string; message: string } | null;
}

/** A recognisable stand-in for server-side compilation: enough to tell queries apart. */
function describeSpec(spec: QuerySpec): string {
  const joins = spec.joins.map((j) => ` ${j.type.toUpperCase()} JOIN ${j.table}`).join('');
  return `SELECT ${spec.select.length || '*'} FROM ${spec.from.table}${joins} LIMIT ${spec.limit}`;
}

/**
 * Stubs `fetch` with an in-memory implementation of the JARVIS API, faithful
 * to the real contract (shapes, status codes, password never returned).
 */
export function installFakeApi(
  initial: Partial<Pick<FakeApi, 'profiles' | 'online'>> = {},
): FakeApi {
  const state: FakeApi = {
    requests: [],
    profiles: initial.profiles ?? [],
    validPassword: 's3cret',
    online: initial.online ?? true,
    queryResult: {
      columns: [
        { name: 'id', table: 'customers', dataType: 'long', numeric: true },
        { name: 'name', table: 'customers', dataType: 'var_string', numeric: false },
      ],
      rows: [
        [1, 'Ada'],
        [2, null],
      ],
      rowCount: 2,
      durationMs: 12,
    },
    queryError: null,
  };
  const passwords = new Map<string, string>();
  let nextId = 1;
  const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;

  const toProfile = (
    id: string,
    input: ConnectionCreateInput,
    previous?: ConnectionProfile,
  ): ConnectionProfile => {
    const { password: _password, ...settings } = input;
    return {
      id,
      ...settings,
      hasPassword: (passwords.get(id) ?? '') !== '',
      createdAt: previous?.createdAt ?? '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastConnectedAt: previous?.lastConnectedAt ?? null,
      connected: previous?.connected ?? false,
      serverVersion: previous?.serverVersion ?? null,
    };
  };

  const handler = async (url: string, init?: RequestInit): Promise<Response> => {
    if (!state.online) throw new TypeError('Failed to fetch');
    const method = init?.method ?? 'GET';
    const path = url.replace(/^\/api/, '');
    const body = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : undefined;
    state.requests.push({ method, path, body });

    if (path === '/health') return json(HEALTH);
    if (/^\/query-executions\/[^/]+\/cancel$/.test(path)) return json({ cancelled: true });
    if (path === '/connections' && method === 'GET') return json({ connections: state.profiles });

    if (path === '/connections' && method === 'POST') {
      const input = body as unknown as ConnectionCreateInput;
      if (state.profiles.some((p) => p.name.toLowerCase() === input.name.toLowerCase())) {
        return fail(409, 'CONFLICT', `A connection named "${input.name}" already exists`);
      }
      const id = newId();
      passwords.set(id, input.password);
      const profile = toProfile(id, input);
      state.profiles = [...state.profiles, profile];
      return json(profile, 201);
    }

    if (path === '/connections/test' && method === 'POST') {
      const password =
        (body?.password as string | undefined) ?? passwords.get(body?.id as string) ?? '';
      if (password !== state.validPassword) {
        return fail(502, 'DB_CONNECTION_FAILED', 'Access denied. Check the username and password.');
      }
      return json({
        ok: true,
        serverVersion: '8.0.45',
        authenticatedAs: `${String(body?.user)}@localhost`,
        latencyMs: 7,
      });
    }

    const match = /^\/connections\/([^/]+)(\/.*)?$/.exec(path);
    const profile = match ? state.profiles.find((p) => p.id === match[1]) : undefined;
    if (!match || !profile) return fail(404, 'NOT_FOUND', 'Connection not found');
    const rest = match[2] ?? '';
    const replace = (next: ConnectionProfile) => {
      state.profiles = state.profiles.map((p) => (p.id === next.id ? next : p));
      return json(next);
    };

    if (rest === '' && method === 'PUT') {
      const input = body as unknown as ConnectionCreateInput;
      if (input.password !== undefined) passwords.set(profile.id, input.password);
      return replace(toProfile(profile.id, input, profile));
    }
    if (rest === '' && method === 'DELETE') {
      state.profiles = state.profiles.filter((p) => p.id !== profile.id);
      return json({ deleted: true });
    }
    if (rest === '/connect') {
      if (passwords.get(profile.id) !== state.validPassword) {
        return fail(502, 'DB_CONNECTION_FAILED', 'Access denied. Check the username and password.');
      }
      return replace({
        ...profile,
        connected: true,
        serverVersion: '8.0.45',
        lastConnectedAt: '2026-01-02T00:00:00.000Z',
      });
    }
    if (rest === '/disconnect')
      return replace({ ...profile, connected: false, serverVersion: null });
    if (!profile.connected) return fail(409, 'NOT_CONNECTED', 'This connection is not open.');
    if (rest === '/databases') {
      return json({
        databases: [
          {
            name: 'information_schema',
            charset: 'utf8mb3',
            collation: 'utf8mb3_general_ci',
            system: true,
          },
          { name: 'shop', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci', system: false },
        ],
      });
    }
    if (rest === '/databases/shop/schema') return json(DEMO_SCHEMA);
    if (rest === '/databases/shop/query/compile') {
      const sql = describeSpec(body as unknown as QuerySpec);
      return json({ sql, params: [], displaySql: sql });
    }
    if (rest === '/databases/shop/query/execute') {
      if (state.queryError) {
        return fail(state.queryError.status, state.queryError.code, state.queryError.message);
      }
      const spec = (body as { query: QuerySpec }).query;
      const sql = describeSpec(spec);
      return json({
        ...state.queryResult,
        sql,
        displaySql: sql,
        limit: spec.limit,
        offset: spec.offset,
      });
    }
    return fail(404, 'NOT_FOUND', 'Not found');
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)),
  );
  return state;
}
