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
import { LoginThrottle, type SessionAuth } from './security/session-auth.js';
import type { ConnectionService } from './services/connection.service.js';
import type { QueryService } from './services/query.service.js';

export interface AppDeps {
  config: Pick<ServerConfig, 'allowedOrigins' | 'env'> &
    Partial<Pick<ServerConfig, 'publicOrigins' | 'trustProxy'>>;
  logger: Logger;
  version: string;
  connectionService: ConnectionService;
  queryService: QueryService;
  startedAt?: number;
  /** Directory of the built web app. When present it is served with an SPA fallback. */
  staticDir?: string;
  /** Present when a login is required (`JARVIS_AUTH_PASSWORD`). */
  auth?: SessionAuth;
  loginThrottle?: LoginThrottle;
}

export function createApp({
  config,
  logger,
  version,
  connectionService,
  queryService,
  startedAt = Date.now(),
  staticDir,
  auth,
  loginThrottle = new LoginThrottle(),
}: AppDeps): Express {
  const publicOrigins = config.publicOrigins ?? [];
  const app = express();
  app.disable('x-powered-by');
  // Behind a hosting platform's proxy this makes req.ip / req.secure reflect the client.
  app.set('trust proxy', config.trustProxy ?? false);

  // helmet's default CSP upgrades every asset request to https, which leaves the page
  // blank when it is opened over plain http from another machine (e.g. on a LAN).
  const servedOverHttp = publicOrigins.some((origin) => origin.startsWith('http:'));
  app.use(
    helmet(
      servedOverHttp
        ? {
            contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
            strictTransportSecurity: false,
          }
        : {},
    ),
  );
  app.use(requestId);
  app.use(localOnly(config.allowedOrigins, publicOrigins));
  app.use(express.json({ limit: '2mb' }));

  app.use(
    API_PREFIX,
    createApiRouter({
      version,
      startedAt,
      connectionService,
      queryService,
      auth,
      loginThrottle,
    }),
  );

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
