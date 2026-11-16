import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { createServices, type Services } from '../container.js';
import { silentLogger } from '../lib/logger.js';

export interface TestApp {
  app: Express;
  services: Services;
  dataDir: string;
  /** Closes pools and removes the temporary data directory. */
  cleanup: () => Promise<void>;
}

/** Builds the real app against a throwaway data directory. */
export function createTestApp(
  options: {
    version?: string;
    startedAt?: number;
    allowedOrigins?: string[];
    queryTimeoutMs?: number;
  } = {},
): TestApp {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-test-'));
  const services = createServices({
    dataDir,
    logger: silentLogger,
    queryTimeoutMs: options.queryTimeoutMs,
  });
  const app = createApp({
    config: { env: 'test', allowedOrigins: options.allowedOrigins ?? ['http://localhost:5173'] },
    logger: silentLogger,
    version: options.version ?? '0.0.0-test',
    startedAt: options.startedAt,
    connectionService: services.connectionService,
    queryService: services.queryService,
  });
  return {
    app,
    services,
    dataDir,
    cleanup: async () => {
      await services.connectionManager.closeAll();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export interface TestMysql {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Credentials of the project-local dev MySQL instance (`npm run db:init`),
 * or null when it is not set up — MySQL-backed tests are skipped in that case.
 */
export function testMysql(): TestMysql | null {
  const env = process.env;
  if (!env.JARVIS_TEST_MYSQL_HOST || !env.JARVIS_TEST_MYSQL_USER) return null;
  return {
    host: env.JARVIS_TEST_MYSQL_HOST,
    port: Number(env.JARVIS_TEST_MYSQL_PORT ?? 3306),
    user: env.JARVIS_TEST_MYSQL_USER,
    password: env.JARVIS_TEST_MYSQL_PASSWORD ?? '',
    database: env.JARVIS_TEST_MYSQL_DATABASE ?? 'jarvis_demo',
  };
}
