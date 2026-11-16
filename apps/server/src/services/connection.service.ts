import type {
  ConnectionCreateInput,
  ConnectionProfile,
  ConnectionTestInput,
  ConnectionTestResult,
  ConnectionUpdateInput,
  DatabaseInfo,
  DatabaseSchema,
} from '@jarvis/shared';
import type { ConnectionManager, ConnectionParams } from '../db/connection-manager.js';
import { listDatabases, loadSchema } from '../introspection/schema-introspector.js';
import type { ConnectionStore, StoredConnection } from '../storage/connection-store.js';

/** Settings that require a new pool when they change. */
function sessionSettingsChanged(before: StoredConnection, after: StoredConnection): boolean {
  return (
    before.host !== after.host ||
    before.port !== after.port ||
    before.user !== after.user ||
    before.database !== after.database ||
    before.connectTimeoutMs !== after.connectTimeoutMs ||
    JSON.stringify(before.ssl) !== JSON.stringify(after.ssl)
  );
}

const cacheKey = (id: string, database: string) => `${id}:${database}`;

/**
 * Connection use-cases: saved profiles (store) + live sessions (manager).
 * This is the only place the two meet, and the only place a decrypted
 * password is handed to the driver.
 */
export class ConnectionService {
  /**
   * Last schema read per `connectionId:database`. The query compiler validates
   * against it on every keystroke-driven preview, so it must not hit MySQL each
   * time. Refreshed whenever the client asks for the schema; dropped on disconnect.
   */
  private readonly schemaCache = new Map<string, DatabaseSchema>();

  constructor(
    private readonly store: ConnectionStore,
    private readonly manager: ConnectionManager,
  ) {}

  list(): ConnectionProfile[] {
    return this.store.list().map((stored) => this.toProfile(stored));
  }

  create(input: ConnectionCreateInput): ConnectionProfile {
    return this.toProfile(this.store.create(input));
  }

  /** Saves changes. An open session is closed if the change would make it stale. */
  async update(id: string, input: ConnectionUpdateInput): Promise<ConnectionProfile> {
    const before = this.store.get(id);
    const after = this.store.update(id, input);
    if (input.password !== undefined || sessionSettingsChanged(before, after)) {
      await this.closeSession(id);
    }
    return this.toProfile(after);
  }

  async remove(id: string): Promise<void> {
    this.store.get(id);
    await this.closeSession(id);
    this.store.delete(id);
  }

  async test(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    const { id, password, ...settings } = input;
    // Editing a saved connection without retyping the password: use the stored one.
    const effectivePassword = password ?? (id ? this.store.getPassword(id) : '');
    const result = await this.manager.test({ ...settings, password: effectivePassword });
    return { ok: true, ...result };
  }

  async connect(id: string): Promise<ConnectionProfile> {
    const stored = this.store.get(id);
    await this.manager.connect(id, this.paramsFor(stored));
    return this.toProfile(this.store.markConnected(id));
  }

  async disconnect(id: string): Promise<ConnectionProfile> {
    const stored = this.store.get(id);
    await this.closeSession(id);
    return this.toProfile(stored);
  }

  async databases(id: string): Promise<DatabaseInfo[]> {
    this.store.get(id);
    return listDatabases(this.manager.getPool(id));
  }

  /** Reads the schema from MySQL and refreshes the cache. */
  async schema(id: string, database: string): Promise<DatabaseSchema> {
    this.store.get(id);
    const schema = await loadSchema(this.manager.getPool(id), database);
    this.schemaCache.set(cacheKey(id, database), schema);
    return schema;
  }

  /** The cached schema, loading it first if this database has not been read yet. */
  async cachedSchema(id: string, database: string): Promise<DatabaseSchema> {
    this.store.get(id);
    // getPool() throws NOT_CONNECTED, so a closed session never serves cached metadata.
    this.manager.getPool(id);
    return this.schemaCache.get(cacheKey(id, database)) ?? this.schema(id, database);
  }

  private async closeSession(id: string): Promise<void> {
    await this.manager.disconnect(id);
    for (const key of this.schemaCache.keys()) {
      if (key.startsWith(`${id}:`)) this.schemaCache.delete(key);
    }
  }

  private paramsFor(stored: StoredConnection): ConnectionParams {
    return {
      host: stored.host,
      port: stored.port,
      user: stored.user,
      password: this.store.getPassword(stored.id),
      database: stored.database,
      ssl: stored.ssl,
      connectTimeoutMs: stored.connectTimeoutMs,
    };
  }

  private toProfile(stored: StoredConnection): ConnectionProfile {
    return {
      ...stored,
      connected: this.manager.isConnected(stored.id),
      serverVersion: this.manager.identity(stored.id)?.serverVersion ?? null,
    };
  }
}
