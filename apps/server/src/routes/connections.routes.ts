import { Router } from 'express';
import { createConnectionsController } from '../controllers/connections.controller.js';
import type { ConnectionService } from '../services/connection.service.js';

export function createConnectionsRouter(service: ConnectionService): Router {
  const controller = createConnectionsController(service);
  const router = Router();

  router.get('/', controller.list);
  router.post('/', controller.create);
  // Registered before '/:id' routes so "test" is never read as an id.
  router.post('/test', controller.test);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/connect', controller.connect);
  router.post('/:id/disconnect', controller.disconnect);
  router.get('/:id/databases', controller.databases);
  router.get('/:id/databases/:database/schema', controller.schema);

  return router;
}
