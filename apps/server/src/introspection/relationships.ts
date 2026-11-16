import type { Relationship, TableInfo } from '@jarvis/shared';

function sameColumnSet(a: readonly string[], b: readonly (string | null)[]): boolean {
  return a.length === b.length && a.every((column) => b.includes(column));
}

/**
 * Whether a set of columns is guaranteed unique in a table, i.e. it exactly
 * matches the column set of the primary key or of a full-column unique index.
 * Prefix indexes (`subPart`) do not make the whole column unique.
 */
export function isUniqueColumnSet(table: TableInfo, columns: readonly string[]): boolean {
  return table.indexes.some(
    (index) =>
      index.unique &&
      index.columns.every((c) => c.subPart === null) &&
      sameColumnSet(
        columns,
        index.columns.map((c) => c.name),
      ),
  );
}

/**
 * Derives table relationships from declared FOREIGN KEY constraints — the only
 * relationships the database guarantees. Nothing is inferred from column names.
 *
 * Cardinality is read from the child side: a foreign key is `one-to-one` when
 * its columns are also unique in the child table, otherwise `many-to-one`.
 */
export function deriveRelationships(tables: readonly TableInfo[]): Relationship[] {
  const relationships: Relationship[] = [];
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      relationships.push({
        id: `fk:${table.name}:${fk.name}`,
        source: 'foreign-key',
        constraintName: fk.name,
        fromTable: table.name,
        fromColumns: fk.columns,
        toSchema: fk.referencedSchema,
        toTable: fk.referencedTable,
        toColumns: fk.referencedColumns,
        cardinality: isUniqueColumnSet(table, fk.columns) ? 'one-to-one' : 'many-to-one',
        onUpdate: fk.onUpdate,
        onDelete: fk.onDelete,
      });
    }
  }
  return relationships;
}
