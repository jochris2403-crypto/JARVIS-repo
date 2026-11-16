import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { API_PREFIX } from '@jarvis/shared';
import type { ServerConfig } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { localOnly } from './middleware/local-only.js';
import { requestId } from './middleware/request-id.js';
import { createApiRouter } from './routes/index.js';
import type { ConnectionService } from './services/connection.service.js';
import type { QueryService } from './services/query.service.js';

export interface AppDeps {
  config: Pick<ServerConfig, 'allowedOrigins' | 'env'>;
  logger: Logger;
  version: string;
  connectionService: ConnectionService;
  queryService: QueryService;
  startedAt?: number;
  /** Directory of the built web app. When present it is served with an SPA fallback. */
  staticDir?: string;
}

export function createApp({
  config,
  logger,
  version,
  connectionService,
  queryService,
  startedAt = Date.now(),
  staticDir,
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(helmet());
  app.use(requestId);
  app.use(localOnly(config.allowedOrigins));
  app.use(express.json({ limit: '2mb' }));

  app.use(API_PREFIX, createApiRouter({ version, startedAt, connectionService, queryService }));

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(
      express.static(staticDir, { index: false, maxAge: config.env === 'production' ? '1h' : 0 }),
    );
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(createErrorHandler(logger));
  return app;
}
