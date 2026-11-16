import type { CompiledQuery, QueryResult, QuerySpec } from '@jarvis/shared';
import { compileQuery } from '../query/compiler.js';
import type { QueryExecutor } from '../query/executor.js';
import type { ConnectionService } from './connection.service.js';

/** Visual-query use-cases: compile a QuerySpec for preview, run it, cancel it. */
export class QueryService {
  constructor(
    private readonly connections: ConnectionService,
    private readonly executor: QueryExecutor,
  ) {}

  /** Compiles against the schema the server last read for this database. */
  async compile(connectionId: string, database: string, spec: QuerySpec): Promise<CompiledQuery> {
    const schema = await this.connections.cachedSchema(connectionId, database);
    return compileQuery(spec, schema);
  }

  async execute(
    connectionId: string,
    database: string,
    spec: QuerySpec,
    executionId: string,
  ): Promise<QueryResult> {
    const compiled = await this.compile(connectionId, database, spec);
    const result = await this.executor.execute({
      executionId,
      connectionId,
      sql: compiled.sql,
      params: compiled.params,
    });
    return {
      sql: compiled.sql,
      displaySql: compiled.displaySql,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rows.length,
      durationMs: result.durationMs,
      limit: spec.limit,
      offset: spec.offset,
    };
  }

  cancel(executionId: string): Promise<boolean> {
    return this.executor.cancel(executionId);
  }
}
