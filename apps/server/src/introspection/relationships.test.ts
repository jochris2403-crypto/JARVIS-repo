import type { TableInfo } from '@jarvis/shared';
import { describe, expect, it } from 'vitest';
import { deriveRelationships, isUniqueColumnSet } from './relationships.js';

function table(partial: Partial<TableInfo> & { name: string }): TableInfo {
  return {
    type: 'table',
    engine: 'InnoDB',
    rowEstimate: 0,
    dataBytes: 0,
    indexBytes: 0,
    collation: null,
    comment: '',
    createdAt: null,
    columns: [],
    primaryKey: [],
    indexes: [],
    foreignKeys: [],
    ...partial,
  };
}

const index = (
  name: string,
  columns: string[],
  unique: boolean,
  subPart: number | null = null,
) => ({
  name,
  unique,
  primary: name === 'PRIMARY',
  type: 'BTREE',
  columns: columns.map((c) => ({ name: c, subPart })),
});

const fk = (
  name: string,
  columns: string[],
  referencedTable: string,
  referencedColumns: string[],
) => ({
  name,
  columns,
  referencedSchema: 'app',
  referencedTable,
  referencedColumns,
  onUpdate: 'NO ACTION',
  onDelete: 'CASCADE',
});

describe('isUniqueColumnSet', () => {
  const t = table({
    name: 't',
    indexes: [
      index('PRIMARY', ['a', 'b'], true),
      index('idx_c', ['c'], false),
      index('uq_d', ['d'], true, 10),
    ],
  });

  it('matches a unique index regardless of column order', () => {
    expect(isUniqueColumnSet(t, ['b', 'a'])).toBe(true);
  });
  it('does not treat a subset of a composite key as unique', () => {
    expect(isUniqueColumnSet(t, ['a'])).toBe(false);
  });
  it('ignores non-unique and prefix indexes', () => {
    expect(isUniqueColumnSet(t, ['c'])).toBe(false);
    expect(isUniqueColumnSet(t, ['d'])).toBe(false);
  });
});

describe('deriveRelationships', () => {
  it('classifies cardinality from the child table’s unique indexes', () => {
    const tables = [
      table({ name: 'parent', indexes: [index('PRIMARY', ['id'], true)] }),
      table({
        name: 'child',
        indexes: [index('PRIMARY', ['id'], true), index('idx_parent', ['parent_id'], false)],
        foreignKeys: [fk('fk_child_parent', ['parent_id'], 'parent', ['id'])],
      }),
      table({
        name: 'profile',
        indexes: [index('PRIMARY', ['parent_id'], true)],
        foreignKeys: [fk('fk_profile_parent', ['parent_id'], 'parent', ['id'])],
      }),
    ];
    const relationships = deriveRelationships(tables);
    expect(relationships).toHaveLength(2);
    expect(relationships[0]).toMatchObject({
      id: 'fk:child:fk_child_parent',
      source: 'foreign-key',
      fromTable: 'child',
      toTable: 'parent',
      cardinality: 'many-to-one',
    });
    expect(relationships[1]).toMatchObject({ fromTable: 'profile', cardinality: 'one-to-one' });
  });

  it('infers nothing from matching column names without a foreign key', () => {
    const tables = [
      table({ name: 'a', indexes: [index('PRIMARY', ['contact_id'], true)] }),
      table({ name: 'b', indexes: [index('idx', ['contact_id'], false)] }),
    ];
    expect(deriveRelationships(tables)).toEqual([]);
  });
});
