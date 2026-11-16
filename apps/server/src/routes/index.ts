import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';
import { notFoundHandler } from '../middleware/error-handler.js';
import { createQueryController } from '../controllers/query.controller.js';
import type { ConnectionService } from '../services/connection.service.js';
import type { QueryService } from '../services/query.service.js';
import { createConnectionsRouter } from './connections.routes.js';

export interface ApiRouterDeps {
  version: string;
  startedAt: number;
  connectionService: ConnectionService;
  queryService: QueryService;
}

/** Mounts every API route. New feature routers are registered here. */
export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();
  router.get('/health', createHealthController(deps));
  router.use('/connections', createConnectionsRouter(deps.connectionService));

  const query = createQueryController(deps.queryService);
  router.post('/connections/:id/databases/:database/query/compile', query.compile);
  router.post('/connections/:id/databases/:database/query/execute', query.execute);
  router.post('/query-executions/:executionId/cancel', query.cancel);

  // Any unmatched /api/* route is a JSON 404, never the SPA fallback.
  router.use(notFoundHandler);
  return router;
}
