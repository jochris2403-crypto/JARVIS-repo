import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryResultSchema, type QuerySpec } from '@jarvis/shared';
import { createTestApp, testMysql, type TestApp } from '../test/test-app.js';

const mysql = testMysql();
const col = (table: string, column: string) => ({ table, column });
const colOp = (table: string, column: string) => ({
  kind: 'column' as const,
  column: col(table, column),
});

function spec(overrides: Partial<QuerySpec> = {}): QuerySpec {
  return {
    distinct: false,
    from: { table: 'ContactDetails', alias: 'c' },
    joins: [],
    select: [],
    where: null,
    groupBy: [],
    having: null,
    orderBy: [{ expr: colOp('c', 'contact_id'), direction: 'asc' }],
    limit: 100,
    offset: 0,
    ...overrides,
  };
}

describe.skipIf(!mysql)('query endpoints (live MySQL)', () => {
  let ctx: TestApp;
  let base: string;

  beforeEach(async () => {
    ctx = createTestApp();
    const { body: profile } = await request(ctx.app)
      .post('/api/connections')
      .send({
        name: 'Dev',
        host: mysql!.host,
        port: mysql!.port,
        user: mysql!.user,
        password: mysql!.password,
        ssl: { enabled: false, rejectUnauthorized: true },
        connectTimeoutMs: 5000,
        readOnly: false,
      });
    await request(ctx.app).post(`/api/connections/${profile.id}/connect`).expect(200);
    base = `/api/connections/${profile.id}/databases/${mysql!.database}/query`;
  });
  afterEach(() => ctx.cleanup());

  const run = (query: QuerySpec) =>
    request(ctx.app).post(`${base}/execute`).send({ query, executionId: randomUUID() });

  it('previews SQL without running it', async () => {
    const res = await request(ctx.app).post(`${base}/compile`).send(spec()).expect(200);
    expect(res.body.sql).toContain(`FROM \`${mysql!.database}\`.\`ContactDetails\` AS \`c\``);
    expect(res.body.params).toEqual([]);
  });

  it('runs a query and returns typed columns and rows', async () => {
    const res = await run(
      spec({
        select: [
          { kind: 'column', column: col('c', 'contact_id') },
          { kind: 'column', column: col('c', 'first_name'), alias: 'First' },
          { kind: 'column', column: col('c', 'created_at') },
        ],
      }),
    ).expect(200);
    const result = queryResultSchema.parse(res.body);
    expect(result.columns.map((c) => c.name)).toEqual(['contact_id', 'First', 'created_at']);
    expect(result.columns[0]).toMatchObject({ table: 'c', dataType: 'int', numeric: true });
    expect(result.columns.map((c) => c.dataType)).toEqual(['int', 'varchar', 'timestamp']);
    expect(result.rowCount).toBe(4);
    expect(result.rows[0]!.slice(0, 2)).toEqual([1, 'Asha']);
    // Dates come back as MySQL wrote them, not shifted into another timezone.
    expect(result.rows[0]![2]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs the nested-condition example across three joined tables', async () => {
    const join = (table: string) => ({
      type: 'left' as const,
      table,
      alias: table,
      on: [
        { left: col('c', 'contact_id'), operator: 'eq' as const, right: col(table, 'contact_id') },
      ],
    });
    const res = await run(
      spec({
        distinct: true,
        joins: [join('ContactPhones'), join('ContactEmails')],
        select: [{ kind: 'column', column: col('c', 'first_name') }],
        where: {
          kind: 'group',
          op: 'and',
          items: [
            {
              kind: 'condition',
              left: colOp('c', 'status'),
              operator: 'eq',
              right: { kind: 'value', value: 'ACTIVE' },
            },
            {
              kind: 'group',
              op: 'or',
              items: [
                {
                  kind: 'condition',
                  left: colOp('ContactPhones', 'country_code'),
                  operator: 'eq',
                  right: { kind: 'value', value: '+234' },
                },
                {
                  kind: 'condition',
                  left: colOp('ContactEmails', 'email_address'),
                  operator: 'like',
                  right: { kind: 'value', value: '%@example.com' },
                },
              ],
            },
          ],
        },
        orderBy: [{ expr: colOp('c', 'first_name'), direction: 'asc' }],
      }),
    ).expect(200);
    // Asha: active, example.com email. Ben: active, +234 phone. Chloe is inactive. Dev matches neither branch.
    expect(res.body.rows).toEqual([['Asha'], ['Ben']]);
  });

  it('aggregates with GROUP BY and HAVING', async () => {
    const count = { fn: 'COUNT' as const, column: col('p', 'phone_id'), distinct: false };
    const res = await run(
      spec({
        joins: [
          {
            type: 'left',
            table: 'ContactPhones',
            alias: 'p',
            on: [{ left: col('c', 'contact_id'), operator: 'eq', right: col('p', 'contact_id') }],
          },
        ],
        select: [
          { kind: 'column', column: col('c', 'first_name') },
          { kind: 'aggregate', aggregate: count, alias: 'phones' },
        ],
        groupBy: [col('c', 'contact_id'), col('c', 'first_name')],
        having: {
          kind: 'group',
          op: 'and',
          items: [
            {
              kind: 'condition',
              left: { kind: 'aggregate', aggregate: count },
              operator: 'gte',
              right: { kind: 'value', value: '1' },
            },
          ],
        },
        orderBy: [
          { expr: { kind: 'aggregate', aggregate: count }, direction: 'desc' },
          { expr: colOp('c', 'first_name'), direction: 'asc' },
        ],
      }),
    ).expect(200);
    expect(res.body.rows).toEqual([
      ['Asha', 2],
      ['Ben', 1],
      ['Dev', 1],
    ]);
  });

  it('pages with LIMIT and OFFSET', async () => {
    const res = await run(
      spec({ select: [{ kind: 'column', column: col('c', 'contact_id') }], limit: 2, offset: 1 }),
    ).expect(200);
    expect(res.body.rows).toEqual([[2], [3]]);
    expect(res.body).toMatchObject({ limit: 2, offset: 1, rowCount: 2 });
  });

  it('returns JSON, NULL, decimal and generated values faithfully', async () => {
    const profiles = await run(
      spec({
        joins: [
          {
            type: 'left',
            table: 'ContactProfiles',
            alias: 'pr',
            on: [{ left: col('c', 'contact_id'), operator: 'eq', right: col('pr', 'contact_id') }],
          },
        ],
        select: [
          { kind: 'column', column: col('pr', 'settings') },
          { kind: 'column', column: col('pr', 'birthday') },
        ],
        limit: 2,
      }),
    ).expect(200);
    expect(profiles.body.rows).toEqual([
      ['{"newsletter":true}', '1990-04-12'],
      [null, null],
    ]);

    const items = await run(
      spec({
        from: { table: 'OrderItems', alias: 'i' },
        select: [{ kind: 'column', column: col('i', 'line_total') }],
        orderBy: [{ expr: colOp('i', 'item_id'), direction: 'asc' }],
        limit: 1,
      }),
    ).expect(200);
    // DECIMAL stays an exact string rather than a rounded float.
    expect(items.body.rows).toEqual([['199.00']]);
  });

  it('treats hostile values as data', async () => {
    const res = await run(
      spec({
        where: {
          kind: 'group',
          op: 'and',
          items: [
            {
              kind: 'condition',
              left: colOp('c', 'first_name'),
              operator: 'eq',
              right: { kind: 'value', value: "x' OR '1'='1" },
            },
          ],
        },
      }),
    ).expect(200);
    expect(res.body.rowCount).toBe(0);
    const check = await run(spec()).expect(200);
    expect(check.body.rowCount).toBe(4);
  });

  it('rejects unknown identifiers before reaching MySQL', async () => {
    const res = await run(spec({ from: { table: 'mysql.user', alias: 'u' }, orderBy: [] })).expect(
      422,
    );
    expect(res.body.error.message).toMatch(/does not exist/);
  });

  it('reports MySQL errors with the server’s message', async () => {
    const res = await run(
      spec({
        where: {
          kind: 'group',
          op: 'and',
          items: [
            {
              kind: 'condition',
              left: colOp('c', 'first_name'),
              operator: 'regexp',
              right: { kind: 'value', value: '(' },
            },
          ],
        },
      }),
    ).expect(400);
    expect(res.body.error.code).toBe('DB_QUERY_FAILED');
    expect(res.body.error.details.mysqlCode).toBeTruthy();
  });

  it('accepts no SQL text in any form', async () => {
    await request(ctx.app)
      .post(`${base}/execute`)
      .send({ sql: 'SELECT 1', executionId: randomUUID() })
      .expect(422);
    await request(ctx.app).post(`${base}/compile`).send({ sql: 'SELECT 1' }).expect(422);
  });

  it('requires an open connection', async () => {
    await ctx.services.connectionManager.closeAll();
    const res = await run(spec()).expect(409);
    expect(res.body.error.code).toBe('NOT_CONNECTED');
  });

  it('reports cancel of an unknown execution as not cancelled', async () => {
    const res = await request(ctx.app)
      .post(`/api/query-executions/${randomUUID()}/cancel`)
      .expect(200);
    expect(res.body).toEqual({ cancelled: false });
  });
});
