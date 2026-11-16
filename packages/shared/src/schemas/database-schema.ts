import { z } from 'zod';

export const databaseInfoSchema = z.object({
  name: z.string(),
  charset: z.string().nullable(),
  collation: z.string().nullable(),
  /** MySQL's own schemas (`mysql`, `information_schema`, `performance_schema`, `sys`). */
  system: z.boolean(),
});
export type DatabaseInfo = z.infer<typeof databaseInfoSchema>;

export const databaseListResponseSchema = z.object({ databases: z.array(databaseInfoSchema) });

export const columnSchema = z.object({
  name: z.string(),
  position: z.number().int(),
  /** Base type, e.g. `varchar`. */
  dataType: z.string(),
  /** Full type as MySQL reports it, e.g. `varchar(80)` or `int unsigned`. */
  columnType: z.string(),
  nullable: z.boolean(),
  defaultValue: z.string().nullable(),
  isPrimaryKey: z.boolean(),
  autoIncrement: z.boolean(),
  generated: z.boolean(),
  extra: z.string(),
  comment: z.string(),
  charMaxLength: z.number().nullable(),
  numericPrecision: z.number().nullable(),
  numericScale: z.number().nullable(),
});
export type ColumnInfo = z.infer<typeof columnSchema>;

export const indexSchema = z.object({
  name: z.string(),
  unique: z.boolean(),
  primary: z.boolean(),
  /** `BTREE`, `FULLTEXT`, `HASH`, `SPATIAL`. */
  type: z.string(),
  columns: z.array(
    z.object({
      /** Null for functional index parts, which index an expression rather than a column. */
      name: z.string().nullable(),
      /** Prefix length for partial indexes. */
      subPart: z.number().nullable(),
    }),
  ),
});
export type IndexInfo = z.infer<typeof indexSchema>;

export const foreignKeySchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  referencedSchema: z.string(),
  referencedTable: z.string(),
  referencedColumns: z.array(z.string()),
  onUpdate: z.string(),
  onDelete: z.string(),
});
export type ForeignKeyInfo = z.infer<typeof foreignKeySchema>;

export const tableSchema = z.object({
  name: z.string(),
  type: z.enum(['table', 'view']),
  engine: z.string().nullable(),
  /** InnoDB's estimate from table statistics — not an exact count. */
  rowEstimate: z.number().nullable(),
  dataBytes: z.number().nullable(),
  indexBytes: z.number().nullable(),
  collation: z.string().nullable(),
  comment: z.string(),
  createdAt: z.string().nullable(),
  columns: z.array(columnSchema),
  primaryKey: z.array(z.string()),
  indexes: z.array(indexSchema),
  foreignKeys: z.array(foreignKeySchema),
});
export type TableInfo = z.infer<typeof tableSchema>;

/**
 * A relationship between two tables. `source` records how JARVIS knows about
 * it: only `foreign-key` relationships are guaranteed by the database.
 */
export const relationshipSchema = z.object({
  id: z.string(),
  source: z.enum(['foreign-key']),
  constraintName: z.string(),
  /** The child table, which holds the foreign key. */
  fromTable: z.string(),
  fromColumns: z.array(z.string()),
  /** The parent table being referenced. */
  toSchema: z.string(),
  toTable: z.string(),
  toColumns: z.array(z.string()),
  /** From the child's point of view: each child row has one parent; `one-to-one` when the FK columns are also unique. */
  cardinality: z.enum(['many-to-one', 'one-to-one']),
  onUpdate: z.string(),
  onDelete: z.string(),
});
export type Relationship = z.infer<typeof relationshipSchema>;

export const routineSchema = z.object({
  name: z.string(),
  type: z.enum(['procedure', 'function']),
});
export type RoutineInfo = z.infer<typeof routineSchema>;

export const triggerSchema = z.object({
  name: z.string(),
  table: z.string(),
  timing: z.string(),
  event: z.string(),
});
export type TriggerInfo = z.infer<typeof triggerSchema>;

export const databaseSchemaSchema = z.object({
  database: z.string(),
  tables: z.array(tableSchema),
  relationships: z.array(relationshipSchema),
  routines: z.array(routineSchema),
  triggers: z.array(triggerSchema),
  loadedAt: z.string(),
});
export type DatabaseSchema = z.infer<typeof databaseSchemaSchema>;
