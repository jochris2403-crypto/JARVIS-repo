import type { RequestHandler } from 'express';
import {
  queryExecuteRequestSchema,
  querySpecSchema,
  type CompiledQuery,
  type QueryResult,
} from '@jarvis/shared';
import { z } from 'zod';
import { parseInput } from '../middleware/validate.js';
import type { QueryService } from '../services/query.service.js';

const idSchema = z.uuid();
const databaseNameSchema = z.string().min(1).max(64);

export interface QueryController {
  compile: RequestHandler;
  execute: RequestHandler;
  cancel: RequestHandler;
}

/**
 * Endpoints for the visual query builder. They accept a QuerySpec only —
 * there is deliberately no way to submit SQL text.
 */
export function createQueryController(service: QueryService): QueryController {
  return {
    compile: async (req, res) => {
      const compiled = await service.compile(
        parseInput(idSchema, req.params.id),
        parseInput(databaseNameSchema, req.params.database),
        parseInput(querySpecSchema, req.body),
      );
      res.json(compiled satisfies CompiledQuery);
    },

    execute: async (req, res) => {
      const connectionId = parseInput(idSchema, req.params.id);
      const database = parseInput(databaseNameSchema, req.params.database);
      const { query, executionId } = parseInput(queryExecuteRequestSchema, req.body);

      // If the browser goes away mid-query (tab closed, request aborted), stop the query too.
      res.on('close', () => {
        if (!res.writableFinished) void service.cancel(executionId);
      });

      const result = await service.execute(connectionId, database, query, executionId);
      res.json(result satisfies QueryResult);
    },

    cancel: async (req, res) => {
      const cancelled = await service.cancel(parseInput(idSchema, req.params.executionId));
      res.json({ cancelled });
    },
  };
}
