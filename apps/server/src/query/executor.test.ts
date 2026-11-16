import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionManager } from '../db/connection-manager.js';
import { silentLogger } from '../lib/logger.js';
import { testMysql } from '../test/test-app.js';
import { QueryExecutor } from './executor.js';

const mysql = testMysql();
const CONNECTION = 'test-connection';

/** Counts a very large cross join: runs for minutes unless something stops it. */
const SLOW_SQL =
  'SELECT COUNT(*) FROM information_schema.COLUMNS a, information_schema.COLUMNS b, information_schema.COLUMNS c';

describe.skipIf(!mysql)('QueryExecutor (live MySQL)', () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    manager = new ConnectionManager(silentLogger);
    await manager.connect(CONNECTION, {
      host: mysql!.host,
      port: mysql!.port,
      user: mysql!.user,
      password: mysql!.password,
      ssl: { enabled: false, rejectUnauthorized: true },
      connectTimeoutMs: 5000,
    });
  });
  afterEach(() => manager.closeAll());

  const input = (sql: string, params: (string | number)[] = [], executionId = randomUUID()) => ({
    executionId,
    connectionId: CONNECTION,
    sql,
    params,
  });

  it('binds parameters and summarises binary values', async () => {
    const executor = new QueryExecutor(manager, silentLogger);
    const result = await executor.execute(
      input('SELECT ? AS a, UNHEX(?) AS b, NULL AS c', ['x', 'CAFEBABE']),
    );
    expect(result.columns.map((c) => c.name)).toEqual(['a', 'b', 'c']);
    expect(result.rows).toEqual([['x', { binary: 'cafebabe', bytes: 4 }, null]]);
  });

  it('stops a query that exceeds the time limit', async () => {
    const executor = new QueryExecutor(manager, silentLogger, 300);
    const started = Date.now();
    await expect(executor.execute(input(SLOW_SQL))).rejects.toMatchObject({
      code: 'QUERY_TIMEOUT',
    });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('cancels a running query and leaves the connection usable', async () => {
    const executor = new QueryExecutor(manager, silentLogger);
    const executionId = randomUUID();
    const pending = executor.execute(input(SLOW_SQL, [], executionId));
    const outcome = expect(pending).rejects.toMatchObject({ code: 'QUERY_CANCELLED' });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await executor.cancel(executionId)).toBe(true);
    await outcome;

    expect(await executor.cancel(executionId)).toBe(false);
    const after = await executor.execute(input('SELECT 1 AS ok'));
    expect(after.rows).toEqual([[1]]);
  });
});
