import {
  compiledQuerySchema,
  queryCancelResponseSchema,
  queryResultSchema,
  type CompiledQuery,
  type QueryResult,
  type QuerySpec,
} from '@jarvis/shared';
import { apiRequest } from './client';

const base = (connectionId: string, database: string) =>
  `/connections/${connectionId}/databases/${encodeURIComponent(database)}/query`;

/** Asks the server to turn a QuerySpec into SQL, without running it. */
export function compileQuery(
  connectionId: string,
  database: string,
  spec: QuerySpec,
  signal?: AbortSignal,
): Promise<CompiledQuery> {
  return apiRequest(`${base(connectionId, database)}/compile`, {
    method: 'POST',
    body: spec,
    schema: compiledQuerySchema,
    signal,
  });
}

export function executeQuery(
  connectionId: string,
  database: string,
  spec: QuerySpec,
  executionId: string,
): Promise<QueryResult> {
  return apiRequest(`${base(connectionId, database)}/execute`, {
    method: 'POST',
    body: { query: spec, executionId },
    schema: queryResultSchema,
    // The server enforces the real limit and answers with QUERY_TIMEOUT; this only guards a dead server.
    timeoutMs: 10 * 60_000,
  });
}

export async function cancelQuery(executionId: string): Promise<boolean> {
  const { cancelled } = await apiRequest(`/query-executions/${executionId}/cancel`, {
    method: 'POST',
    schema: queryCancelResponseSchema,
  });
  return cancelled;
}
