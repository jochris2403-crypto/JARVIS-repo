import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createServices } from './container.js';
import { createLogger } from './lib/logger.js';
import { SERVER_VERSION } from './version.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);

const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(here, '../../web/dist');

const services = createServices({
  dataDir: config.dataDir,
  secretKey: config.secretKey,
  queryTimeoutMs: config.queryTimeoutMs,
  logger,
});

const app = createApp({
  config,
  logger,
  connectionService: services.connectionService,
  queryService: services.queryService,
  version: SERVER_VERSION,
  staticDir: config.env === 'production' ? staticDir : undefined,
});

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback.
const server = app.listen(config.port, config.host, (error?: Error) => {
  if (error) {
    logger.error('Failed to start server', { host: config.host, port: config.port, error });
    process.exit(1);
  }
  logger.info('JARVIS API listening', {
    url: `http://${config.host}:${config.port}`,
    env: config.env,
    dataDir: config.dataDir,
  });
});

function shutdown(signal: string) {
  logger.info('Shutting down', { signal });
  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(0), 5000).unref();
  server.close(() => {
    void services.connectionManager.closeAll().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
