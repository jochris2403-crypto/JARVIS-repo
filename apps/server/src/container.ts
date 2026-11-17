import { ConnectionManager } from './db/connection-manager.js';
import type { Logger } from './lib/logger.js';
import { loadOrCreateKey, SecretBox } from './security/secret-box.js';
import { DEFAULT_QUERY_TIMEOUT_MS, QueryExecutor } from './query/executor.js';
import { ConnectionService } from './services/connection.service.js';
import { QueryService } from './services/query.service.js';
import { ConnectionStore } from './storage/connection-store.js';

export interface Services {
  connectionService: ConnectionService;
  connectionManager: ConnectionManager;
  queryService: QueryService;
  /** The 32-byte server key; also the root of the session-signing key. */
  masterKey: Buffer;
}

/** Builds the service graph. The one place where concrete classes are wired together. */
export function createServices(options: {
  dataDir: string;
  secretKey?: string;
  logger: Logger;
  queryTimeoutMs?: number;
}): Services {
  const masterKey = loadOrCreateKey(options.dataDir, options.secretKey);
  const secretBox = new SecretBox(masterKey);
  const store = new ConnectionStore(options.dataDir, secretBox);
  const connectionManager = new ConnectionManager(options.logger);
  const connectionService = new ConnectionService(store, connectionManager);
  const executor = new QueryExecutor(
    connectionManager,
    options.logger,
    options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
  );
  return {
    masterKey,
    connectionManager,
    connectionService,
    queryService: new QueryService(connectionService, executor),
  };
}
