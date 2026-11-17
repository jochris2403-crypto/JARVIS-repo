import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';
import { notFoundHandler } from '../middleware/error-handler.js';
import { createQueryController } from '../controllers/query.controller.js';
import type { ConnectionService } from '../services/connection.service.js';
import type { LoginThrottle, SessionAuth } from '../security/session-auth.js';
import type { QueryService } from '../services/query.service.js';
import { createAuthRouter, requireSession } from './auth.routes.js';
import { createConnectionsRouter } from './connections.routes.js';

export interface ApiRouterDeps {
  version: string;
  startedAt: number;
  connectionService: ConnectionService;
  queryService: QueryService;
  /** Present when a login is required. */
  auth?: SessionAuth;
  loginThrottle: LoginThrottle;
}

/** Mounts every API route. New feature routers are registered here. */
export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();
  // Public: the health check (used by hosting platforms and the status bar) and sign-in.
  router.get('/health', createHealthController(deps));
  router.use('/auth', createAuthRouter(deps.auth, deps.loginThrottle));

  // Everything below requires a session when authentication is enabled.
  router.use(requireSession(deps.auth));
  router.use('/connections', createConnectionsRouter(deps.connectionService));

  const query = createQueryController(deps.queryService);
  router.post('/connections/:id/databases/:database/query/compile', query.compile);
  router.post('/connections/:id/databases/:database/query/execute', query.execute);
  router.post('/query-executions/:executionId/cancel', query.cancel);

  // Any unmatched /api/* route is a JSON 404, never the SPA fallback.
  router.use(notFoundHandler);
  return router;
}
