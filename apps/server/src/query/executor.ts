import mysql, { type FieldPacket, type PoolConnection } from 'mysql2/promise';
import type { Cell, ResultColumn, Scalar } from '@jarvis/shared';
import type { ConnectionManager } from '../db/connection-manager.js';
import { toQueryError } from '../db/mysql-errors.js';
import { AppError } from '../errors/app-error.js';
import type { Logger } from '../lib/logger.js';

export const DEFAULT_QUERY_TIMEOUT_MS = 30_000;
/** How long after MySQL's own limit the server waits before killing the statement itself. */
const KILL_GRACE_MS = 1_000;
const BINARY_PREVIEW_BYTES = 24;

interface RunningQuery {
  connectionId: string;
  threadId: number;
  cancelled: boolean;
  timedOut: boolean;
}

export interface ExecutionResult {
  columns: ResultColumn[];
  rows: Cell[][];
  durationMs: number;
}

const TYPE_NAMES = new Map<number, string>(
  Object.entries(mysql.Types as unknown as Record<string, number>)
    .filter(([, code]) => typeof code === 'number')
    .map(([name, code]) => [code, name.toLowerCase()]),
);
const NUMERIC_TYPE_NAMES = new Set([
  'decimal',
  'newdecimal',
  'tiny',
  'short',
  'long',
  'longlong',
  'int24',
  'float',
  'double',
  'year',
]);

/** The driver's wire-protocol type names, translated to the SQL names people know. */
const SQL_TYPE_NAMES: Record<string, string> = {
  tiny: 'tinyint',
  short: 'smallint',
  int24: 'mediumint',
  long: 'int',
  longlong: 'bigint',
  newdecimal: 'decimal',
  var_string: 'varchar',
  varchar: 'varchar',
  string: 'char',
};
const BINARY_CHARSET = 63;

function toColumn(field: FieldPacket): ResultColumn {
  const packet = field as FieldPacket & { columnType?: number; characterSet?: number };
  const code = packet.columnType ?? field.type;
  const wireType = (code !== undefined && TYPE_NAMES.get(code)) || 'unknown';
  let dataType = SQL_TYPE_NAMES[wireType] ?? wireType;
  // TEXT and BLOB share wire types; the character set tells them apart.
  if (wireType.endsWith('blob'))
    dataType = packet.characterSet === BINARY_CHARSET ? 'blob' : 'text';
  return {
    name: field.name,
    // The alias used in the query; MySQL's `orgTable` is lower-cased on some platforms.
    table: field.table || null,
    dataType,
    numeric: NUMERIC_TYPE_NAMES.has(wireType),
  };
}

/** Converts a driver value into something JSON can carry without losing meaning. */
function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) {
    return { binary: value.subarray(0, BINARY_PREVIEW_BYTES).toString('hex'), bytes: value.length };
  }
  if (value instanceof Date) return value.toISOString();
  // JSON columns arrive parsed; show them as the JSON text they are.
  return JSON.stringify(value);
}

/**
 * Runs SELECT statements produced by the query compiler, with a time limit and
 * cancellation.
 *
 * Each run takes a dedicated pooled connection so its MySQL thread id is known;
 * cancelling issues `KILL QUERY <thread>` from a second connection, which stops
 * the statement but keeps the session usable.
 */
export class QueryExecutor {
  private readonly running = new Map<string, RunningQuery>();

  constructor(
    private readonly manager: ConnectionManager,
    private readonly logger: Logger,
    private readonly timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
  ) {}

  async execute(input: {
    executionId: string;
    connectionId: string;
    sql: string;
    params: Scalar[];
  }): Promise<ExecutionResult> {
    if (this.running.has(input.executionId)) {
      throw new AppError('CONFLICT', 'This query is already running');
    }
    const pool = this.manager.getPool(input.connectionId);

    let connection: PoolConnection;
    try {
      connection = await pool.getConnection();
    } catch (error) {
      throw toQueryError(error);
    }

    const state: RunningQuery = {
      connectionId: input.connectionId,
      threadId: connection.threadId,
      cancelled: false,
      timedOut: false,
    };
    this.running.set(input.executionId, state);

    // First line of defence: MySQL aborts the SELECT itself. The timer below is the
    // fallback for servers that ignore the hint (it is a comment to MariaDB).
    const sql = input.sql.replace(
      /^SELECT\b/,
      `SELECT /*+ MAX_EXECUTION_TIME(${this.timeoutMs}) */`,
    );
    const timer = setTimeout(() => {
      state.timedOut = true;
      void this.kill(input.executionId, state);
    }, this.timeoutMs + KILL_GRACE_MS);

    const started = performance.now();
    try {
      // execute() uses a server-side prepared statement: values travel separately from the SQL text.
      const [rows, fields] = await connection.execute({ sql, rowsAsArray: true }, input.params);
      // A killed statement can still "succeed" (e.g. an interrupted SLEEP); honour the request anyway.
      if (state.cancelled) throw cancelledError();
      if (state.timedOut) throw this.timeoutError();
      return {
        columns: fields.map(toColumn),
        rows: (rows as unknown[][]).map((row) => row.map(toCell)),
        durationMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (state.cancelled) throw cancelledError();
      const code = (error as { code?: string }).code;
      if (state.timedOut || code === 'ER_QUERY_TIMEOUT') throw this.timeoutError();
      throw toQueryError(error);
    } finally {
      clearTimeout(timer);
      // Remove before releasing, so a late cancel can never hit this connection's next statement.
      this.running.delete(input.executionId);
      connection.release();
    }
  }

  /** Requests cancellation. Returns false when the query is not (or no longer) running. */
  async cancel(executionId: string): Promise<boolean> {
    const state = this.running.get(executionId);
    if (!state) return false;
    state.cancelled = true;
    await this.kill(executionId, state);
    return true;
  }

  private async kill(executionId: string, state: RunningQuery): Promise<void> {
    if (this.running.get(executionId) !== state || !Number.isSafeInteger(state.threadId)) return;
    try {
      // The thread id is an integer from the driver, never user input.
      await this.manager.getPool(state.connectionId).query(`KILL QUERY ${state.threadId}`);
    } catch (error) {
      this.logger.warn('Could not cancel query', { executionId, error });
    }
  }

  private timeoutError(): AppError {
    return new AppError(
      'QUERY_TIMEOUT',
      `The query was stopped after ${Math.round(this.timeoutMs / 1000)} seconds. Add filters or a smaller limit to make it faster.`,
    );
  }
}

function cancelledError(): AppError {
  return new AppError('QUERY_CANCELLED', 'The query was cancelled.');
}
