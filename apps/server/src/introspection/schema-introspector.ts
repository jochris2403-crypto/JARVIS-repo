import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  ColumnInfo,
  DatabaseInfo,
  DatabaseSchema,
  ForeignKeyInfo,
  IndexInfo,
  RoutineInfo,
  TableInfo,
  TriggerInfo,
} from '@jarvis/shared';
import { toQueryError } from '../db/mysql-errors.js';
import { AppError } from '../errors/app-error.js';
import { deriveRelationships } from './relationships.js';

const SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
const INTROSPECTION_TIMEOUT_MS = 30_000;

/*
 * Every query below reads `information_schema` with the database name bound as
 * a parameter — no identifier is ever interpolated into SQL. Columns are
 * aliased explicitly because MySQL 8 returns information_schema column names
 * in upper case while MariaDB and 5.7 do not.
 */

async function query(pool: Pool, sql: string, params: unknown[] = []): Promise<RowDataPacket[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError('QUERY_TIMEOUT', 'Reading schema metadata timed out.')),
      INTROSPECTION_TIMEOUT_MS,
    );
  });
  try {
    const [rows] = await Promise.race([pool.query<RowDataPacket[]>(sql, params), timeout]);
    return rows;
  } catch (error) {
    throw toQueryError(error);
  } finally {
    clearTimeout(timer);
  }
}

const text = (value: unknown): string => (value == null ? '' : String(value));
const textOrNull = (value: unknown): string | null => (value == null ? null : String(value));
const numberOrNull = (value: unknown): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export async function listDatabases(pool: Pool): Promise<DatabaseInfo[]> {
  const rows = await query(
    pool,
    `SELECT SCHEMA_NAME AS name,
            DEFAULT_CHARACTER_SET_NAME AS charset,
            DEFAULT_COLLATION_NAME AS collation
       FROM information_schema.SCHEMATA
      ORDER BY SCHEMA_NAME`,
  );
  return rows.map((row) => {
    const name = text(row.name);
    return {
      name,
      charset: textOrNull(row.charset),
      collation: textOrNull(row.collation),
      system: SYSTEM_SCHEMAS.has(name.toLowerCase()),
    };
  });
}

/** Groups rows by a key, preserving the order rows arrive in. */
function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

function toColumn(row: RowDataPacket): ColumnInfo {
  const extra = text(row.extra);
  return {
    name: text(row.name),
    position: Number(row.position),
    dataType: text(row.dataType),
    columnType: text(row.columnType),
    nullable: row.nullable === 'YES',
    defaultValue: textOrNull(row.defaultValue),
    isPrimaryKey: row.columnKey === 'PRI',
    autoIncrement: /\bauto_increment\b/i.test(extra),
    generated: /\bGENERATED\b/i.test(extra),
    extra,
    comment: text(row.comment),
    charMaxLength: numberOrNull(row.charMaxLength),
    numericPrecision: numberOrNull(row.numericPrecision),
    numericScale: numberOrNull(row.numericScale),
  };
}

function toIndexes(rows: readonly RowDataPacket[]): IndexInfo[] {
  return [...groupBy(rows, (r) => text(r.indexName))].map(([name, parts]) => ({
    name,
    unique: Number(parts[0]?.nonUnique) === 0,
    primary: name === 'PRIMARY',
    type: text(parts[0]?.indexType),
    columns: parts.map((p) => ({
      name: textOrNull(p.columnName),
      subPart: numberOrNull(p.subPart),
    })),
  }));
}

function toForeignKeys(rows: readonly RowDataPacket[]): ForeignKeyInfo[] {
  return [...groupBy(rows, (r) => text(r.constraintName))].map(([name, parts]) => ({
    name,
    columns: parts.map((p) => text(p.columnName)),
    referencedSchema: text(parts[0]?.referencedSchema),
    referencedTable: text(parts[0]?.referencedTable),
    referencedColumns: parts.map((p) => text(p.referencedColumn)),
    onUpdate: text(parts[0]?.onUpdate),
    onDelete: text(parts[0]?.onDelete),
  }));
}

/** Reads the complete structure of one database in six parallel metadata queries. */
export async function loadSchema(pool: Pool, database: string): Promise<DatabaseSchema> {
  const exists = await query(
    pool,
    'SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1',
    [database],
  );
  if (exists.length === 0) throw AppError.notFound(`Database "${database}" does not exist`);

  const [tableRows, columnRows, indexRows, fkRows, routineRows, triggerRows] = await Promise.all([
    query(
      pool,
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS tableType, ENGINE AS engine,
              TABLE_ROWS AS rowEstimate, DATA_LENGTH AS dataBytes, INDEX_LENGTH AS indexBytes,
              TABLE_COLLATION AS collation, TABLE_COMMENT AS comment, CREATE_TIME AS createdAt
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME`,
      [database],
    ),
    query(
      pool,
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, ORDINAL_POSITION AS position,
              DATA_TYPE AS dataType, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable,
              COLUMN_DEFAULT AS defaultValue, COLUMN_KEY AS columnKey, EXTRA AS extra,
              COLUMN_COMMENT AS comment, CHARACTER_MAXIMUM_LENGTH AS charMaxLength,
              NUMERIC_PRECISION AS numericPrecision, NUMERIC_SCALE AS numericScale
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database],
    ),
    query(
      pool,
      `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
              COLUMN_NAME AS columnName, SUB_PART AS subPart, INDEX_TYPE AS indexType
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      [database],
    ),
    query(
      pool,
      `SELECT kcu.TABLE_NAME AS tableName, kcu.CONSTRAINT_NAME AS constraintName,
              kcu.COLUMN_NAME AS columnName,
              kcu.REFERENCED_TABLE_SCHEMA AS referencedSchema,
              kcu.REFERENCED_TABLE_NAME AS referencedTable,
              kcu.REFERENCED_COLUMN_NAME AS referencedColumn,
              rc.UPDATE_RULE AS onUpdate, rc.DELETE_RULE AS onDelete
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
          AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND rc.TABLE_NAME = kcu.TABLE_NAME
        WHERE kcu.TABLE_SCHEMA = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
      [database],
    ),
    query(
      pool,
      `SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS routineType
         FROM information_schema.ROUTINES
        WHERE ROUTINE_SCHEMA = ?
        ORDER BY ROUTINE_NAME`,
      [database],
    ),
    query(
      pool,
      `SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS tableName,
              ACTION_TIMING AS timing, EVENT_MANIPULATION AS event
         FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = ?
        ORDER BY TRIGGER_NAME`,
      [database],
    ),
  ]);

  const columnsByTable = groupBy(columnRows, (r) => text(r.tableName));
  const indexesByTable = groupBy(indexRows, (r) => text(r.tableName));
  const fksByTable = groupBy(fkRows, (r) => text(r.tableName));

  const tables: TableInfo[] = tableRows.map((row) => {
    const name = text(row.name);
    const isView = text(row.tableType).toUpperCase().includes('VIEW');
    const columns = (columnsByTable.get(name) ?? []).map(toColumn);
    return {
      name,
      type: isView ? 'view' : 'table',
      engine: textOrNull(row.engine),
      // Statistics are meaningless for views.
      rowEstimate: isView ? null : numberOrNull(row.rowEstimate),
      dataBytes: isView ? null : numberOrNull(row.dataBytes),
      indexBytes: isView ? null : numberOrNull(row.indexBytes),
      collation: textOrNull(row.collation),
      comment: isView ? '' : text(row.comment),
      createdAt: textOrNull(row.createdAt),
      columns,
      primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
      indexes: toIndexes(indexesByTable.get(name) ?? []),
      foreignKeys: toForeignKeys(fksByTable.get(name) ?? []),
    };
  });

  // COLUMN_KEY lists key columns in table order; the PRIMARY index has the true key order.
  for (const table of tables) {
    const primary = table.indexes.find((index) => index.primary);
    if (primary) {
      table.primaryKey = primary.columns.flatMap((c) => (c.name === null ? [] : [c.name]));
    }
  }

  const routines: RoutineInfo[] = routineRows.map((row) => ({
    name: text(row.name),
    type: text(row.routineType).toUpperCase() === 'FUNCTION' ? 'function' : 'procedure',
  }));
  const triggers: TriggerInfo[] = triggerRows.map((row) => ({
    name: text(row.name),
    table: text(row.tableName),
    timing: text(row.timing),
    event: text(row.event),
  }));

  return {
    database,
    tables,
    relationships: deriveRelationships(tables),
    routines,
    triggers,
    loadedAt: new Date().toISOString(),
  };
}
