import type { Request, RequestHandler } from 'express';
import {
  connectionCreateSchema,
  connectionTestSchema,
  connectionUpdateSchema,
  type ConnectionProfile,
  type ConnectionTestResult,
  type DatabaseInfo,
  type DatabaseSchema,
} from '@jarvis/shared';
import { z } from 'zod';
import { parseInput } from '../middleware/validate.js';
import type { ConnectionService } from '../services/connection.service.js';

const idSchema = z.uuid();
/** MySQL identifiers are at most 64 characters. The name is only ever used as a bound parameter. */
const databaseNameSchema = z.string().min(1).max(64);

const connectionId = (req: Request) => parseInput(idSchema, req.params.id);

export interface ConnectionsController {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  test: RequestHandler;
  connect: RequestHandler;
  disconnect: RequestHandler;
  databases: RequestHandler;
  schema: RequestHandler;
}

/** HTTP ↔ ConnectionService translation. Responses never include passwords. */
export function createConnectionsController(service: ConnectionService): ConnectionsController {
  return {
    list: (_req, res) => {
      res.json({ connections: service.list() } satisfies { connections: ConnectionProfile[] });
    },
    create: (req, res) => {
      const profile = service.create(parseInput(connectionCreateSchema, req.body));
      res.status(201).json(profile satisfies ConnectionProfile);
    },
    update: async (req, res) => {
      const profile = await service.update(
        connectionId(req),
        parseInput(connectionUpdateSchema, req.body),
      );
      res.json(profile satisfies ConnectionProfile);
    },
    remove: async (req, res) => {
      await service.remove(connectionId(req));
      res.json({ deleted: true });
    },
    test: async (req, res) => {
      const result = await service.test(parseInput(connectionTestSchema, req.body));
      res.json(result satisfies ConnectionTestResult);
    },
    connect: async (req, res) => {
      res.json((await service.connect(connectionId(req))) satisfies ConnectionProfile);
    },
    disconnect: async (req, res) => {
      res.json((await service.disconnect(connectionId(req))) satisfies ConnectionProfile);
    },
    databases: async (req, res) => {
      const databases = await service.databases(connectionId(req));
      res.json({ databases } satisfies { databases: DatabaseInfo[] });
    },
    schema: async (req, res) => {
      const database = parseInput(databaseNameSchema, req.params.database);
      const schema = await service.schema(connectionId(req), database);
      res.json(schema satisfies DatabaseSchema);
    },
  };
}
