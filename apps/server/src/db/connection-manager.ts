import mysql, { type ConnectionOptions, type Pool, type RowDataPacket } from 'mysql2/promise';
import type { SslConfig } from '@jarvis/shared';
import { AppError } from '../errors/app-error.js';
import type { Logger } from '../lib/logger.js';
import { toConnectionError } from './mysql-errors.js';

/** Everything needed to open a MySQL session. Lives in server memory only. */
export interface ConnectionParams {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  ssl: SslConfig;
  connectTimeoutMs: number;
}

export interface ServerIdentity {
  serverVersion: string;
  /** The account MySQL authenticated, e.g. `app@localhost`. */
  authenticatedAs: string;
}

interface LiveConnection extends ServerIdentity {
  pool: Pool;
}

const POOL_SIZE = 5;

function baseOptions(params: ConnectionParams): ConnectionOptions {
  return {
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database,
    connectTimeout: params.connectTimeoutMs,
    ssl: params.ssl.enabled
      ? {
          rejectUnauthorized: params.ssl.rejectUnauthorized,
          ...(params.ssl.ca ? { ca: params.ssl.ca } : {}),
        }
      : undefined,
    charset: 'utf8mb4',
    // Dates stay strings (no timezone shifting). Integers beyond JS precision and all
    // DECIMALs stay strings (no rounding); other numbers are numbers.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    // One statement per call: stacked statements can never be smuggled in.
    multipleStatements: false,
  };
}

async function identify(conn: { query: Pool['query'] }): Promise<ServerIdentity> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT VERSION() AS serverVersion, CURRENT_USER() AS authenticatedAs',
  );
  const row = rows[0];
  return {
    serverVersion: String(row?.serverVersion ?? 'unknown'),
    authenticatedAs: String(row?.authenticatedAs ?? 'unknown'),
  };
}

/**
 * Owns every open MySQL connection pool, keyed by saved-connection id.
 * Pools are created on connect and destroyed on disconnect or shutdown.
 */
export class ConnectionManager {
  private readonly live = new Map<string, LiveConnection>();

  constructor(private readonly logger: Logger) {}

  /** Opens a single throwaway session to check that the settings work. */
  async test(params: ConnectionParams): Promise<ServerIdentity & { latencyMs: number }> {
    const started = performance.now();
    let connection: mysql.Connection | undefined;
    try {
      connection = await mysql.createConnection(baseOptions(params));
      const identity = await identify(connection);
      return { ...identity, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      throw toConnectionError(error, params);
    } finally {
      // destroy() rather than end(): a half-open socket must not keep the request waiting.
      connection?.destroy();
    }
  }

  /** Opens a pool for `id`, replacing any existing one. Verifies it before returning. */
  async connect(id: string, params: ConnectionParams): Promise<ServerIdentity> {
    await this.disconnect(id);
    const pool = mysql.createPool({
      ...baseOptions(params),
      connectionLimit: POOL_SIZE,
      maxIdle: 2,
      idleTimeout: 60_000,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
    });
    try {
      const identity = await identify(pool);
      this.live.set(id, { pool, ...identity });
      this.logger.info('Connection opened', {
        connectionId: id,
        host: params.host,
        port: params.port,
      });
      return identity;
    } catch (error) {
      await pool.end().catch(() => undefined);
      throw toConnectionError(error, params);
    }
  }

  async disconnect(id: string): Promise<void> {
    const connection = this.live.get(id);
    if (!connection) return;
    this.live.delete(id);
    await connection.pool.end().catch((error: unknown) => {
      this.logger.warn('Error while closing pool', { connectionId: id, error });
    });
    this.logger.info('Connection closed', { connectionId: id });
  }

  isConnected(id: string): boolean {
    return this.live.has(id);
  }

  identity(id: string): ServerIdentity | null {
    const connection = this.live.get(id);
    return connection
      ? { serverVersion: connection.serverVersion, authenticatedAs: connection.authenticatedAs }
      : null;
  }

  /** The pool for an open connection. Throws NOT_CONNECTED when there is none. */
  getPool(id: string): Pool {
    const connection = this.live.get(id);
    if (!connection) {
      throw new AppError('NOT_CONNECTED', 'This connection is not open. Connect and try again.');
    }
    return connection.pool;
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.disconnect(id)));
  }
}
