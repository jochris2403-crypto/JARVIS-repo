import type {
  ColumnInfo,
  DatabaseSchema,
  ForeignKeyInfo,
  Relationship,
  TableInfo,
} from '@jarvis/shared';
import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  computeHighlight,
  defaultDetail,
  findJunctionTables,
  inferRelationships,
  joinOrder,
  nodeColumns,
} from './graph';
import { layoutGraph } from './layout';

function col(name: string, columnType = 'int unsigned', isPrimaryKey = false): ColumnInfo {
  return {
    name,
    position: 1,
    dataType: columnType.split(/[ (]/)[0]!,
    columnType,
    nullable: !isPrimaryKey,
    defaultValue: null,
    isPrimaryKey,
    autoIncrement: false,
    generated: false,
    extra: '',
    comment: '',
    charMaxLength: null,
    numericPrecision: null,
    numericScale: null,
  };
}

function fk(
  name: string,
  columns: string[],
  referencedTable: string,
  referencedColumns: string[],
  referencedSchema = 'app',
): ForeignKeyInfo {
  return {
    name,
    columns,
    referencedSchema,
    referencedTable,
    referencedColumns,
    onUpdate: 'NO ACTION',
    onDelete: 'CASCADE',
  };
}

function table(
  name: string,
  columns: ColumnInfo[],
  foreignKeys: ForeignKeyInfo[] = [],
  extra: Partial<TableInfo> = {},
): TableInfo {
  const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  return {
    name,
    type: 'table',
    engine: 'InnoDB',
    rowEstimate: 0,
    dataBytes: 0,
    indexBytes: 0,
    collation: null,
    comment: '',
    createdAt: null,
    columns,
    primaryKey,
    indexes: primaryKey.length
      ? [
          {
            name: 'PRIMARY',
            unique: true,
            primary: true,
            type: 'BTREE',
            columns: primaryKey.map((c) => ({ name: c, subPart: null })),
          },
        ]
      : [],
    foreignKeys,
    ...extra,
  };
}

/** Mirrors the server: one relationship per foreign key. */
function schemaOf(tables: TableInfo[]): DatabaseSchema {
  const relationships: Relationship[] = tables.flatMap((t) =>
    t.foreignKeys.map((k) => ({
      id: `fk:${t.name}:${k.name}`,
      source: 'foreign-key' as const,
      constraintName: k.name,
      fromTable: t.name,
      fromColumns: k.columns,
      toSchema: k.referencedSchema,
      toTable: k.referencedTable,
      toColumns: k.referencedColumns,
      cardinality: 'many-to-one' as const,
      onUpdate: k.onUpdate,
      onDelete: k.onDelete,
    })),
  );
  return { database: 'app', tables, relationships, routines: [], triggers: [], loadedAt: '' };
}

const contacts = table('contacts', [
  col('contact_id', 'int unsigned', true),
  col('name', 'varchar(80)'),
]);
const phones = table(
  'phones',
  [col('phone_id', 'int unsigned', true), col('contact_id')],
  [fk('fk_phone', ['contact_id'], 'contacts', ['contact_id'])],
);
const tags = table('tags', [col('tag_id', 'smallint unsigned', true), col('label', 'varchar(40)')]);
const contactTags = table(
  'contact_tags',
  [col('contact_id', 'int unsigned', true), col('tag_id', 'smallint unsigned', true)],
  [
    fk('fk_ct_contact', ['contact_id'], 'contacts', ['contact_id']),
    fk('fk_ct_tag', ['tag_id'], 'tags', ['tag_id']),
  ],
);
const orders = table(
  'orders',
  [col('order_id', 'int unsigned', true), col('contact_id')],
  [fk('fk_order', ['contact_id'], 'contacts', ['contact_id'])],
);
const items = table(
  'items',
  [col('item_id', 'int unsigned', true), col('order_id')],
  [fk('fk_item', ['order_id'], 'orders', ['order_id'])],
);
const audit = table('audit', [col('id', 'bigint unsigned', true), col('action', 'varchar(80)')]);
const tickets = table('tickets', [
  col('ticket_id', 'int unsigned', true),
  col('contact_id'),
  col('tag_id', 'int'),
]);

const schema = schemaOf([contacts, phones, tags, contactTags, orders, items, audit, tickets]);
const fkGraph = buildGraph(schema, { includeInferred: false, mergeJunctions: false });

describe('buildGraph', () => {
  it('draws one relationship per foreign key, parent to child', () => {
    expect(fkGraph.tables).toHaveLength(8);
    expect(fkGraph.relationships.map((r) => `${r.parent}>${r.child}`)).toEqual([
      'contacts>phones',
      'contacts>contact_tags',
      'tags>contact_tags',
      'contacts>orders',
      'orders>items',
    ]);
    expect(fkGraph.relationships.every((r) => r.source === 'foreign-key')).toBe(true);
  });

  it('never invents relationships unless asked to', () => {
    // tickets.contact_id looks like a reference but has no constraint.
    expect(fkGraph.relationships.some((r) => r.child === 'tickets')).toBe(false);
  });

  it('reports foreign keys into other databases instead of drawing them', () => {
    const remote = table(
      'invoices',
      [col('id', 'int unsigned', true), col('customer_id')],
      [fk('fk_remote', ['customer_id'], 'customers', ['id'], 'billing')],
    );
    const graph = buildGraph(schemaOf([remote]), { includeInferred: false, mergeJunctions: false });
    expect(graph.relationships).toEqual([]);
    expect(graph.external).toEqual([
      { table: 'invoices', constraintName: 'fk_remote', target: 'billing.customers' },
    ]);
  });
});

describe('junction tables', () => {
  it('recognises a table that only links two others', () => {
    expect(findJunctionTables(schema)).toEqual([
      { table: 'contact_tags', left: 'contacts', right: 'tags' },
    ]);
  });

  it('does not treat a table with its own data as a junction', () => {
    const enrolments = table(
      'enrolments',
      [
        col('contact_id', 'int unsigned', true),
        col('tag_id', 'smallint unsigned', true),
        col('grade', 'char(1)'),
      ],
      contactTags.foreignKeys,
    );
    expect(findJunctionTables(schemaOf([contacts, tags, enrolments]))).toEqual([]);
  });

  it('merges a junction into one many-to-many relationship when asked', () => {
    const graph = buildGraph(schema, { includeInferred: false, mergeJunctions: true });
    expect(graph.tables.map((t) => t.name)).not.toContain('contact_tags');
    expect(graph.relationships.filter((r) => r.source === 'many-to-many')).toEqual([
      expect.objectContaining({
        parent: 'contacts',
        child: 'tags',
        via: 'contact_tags',
        cardinality: 'many-to-many',
      }),
    ]);
    expect(graph.relationships.some((r) => r.child === 'contact_tags')).toBe(false);
  });
});

describe('inferRelationships', () => {
  it('matches a column to another table’s primary key by name and type', () => {
    expect(inferRelationships(schema)).toEqual([
      expect.objectContaining({
        id: 'inferred:tickets:contact_id',
        source: 'inferred',
        parent: 'contacts',
        child: 'tickets',
        childColumns: ['contact_id'],
        parentColumns: ['contact_id'],
        cardinality: 'many-to-one',
      }),
    ]);
  });

  it('ignores a same-named column of a different type', () => {
    // tickets.tag_id is `int`; tags.tag_id is `smallint unsigned`.
    expect(inferRelationships(schema).some((r) => r.parent === 'tags')).toBe(false);
  });

  it('ignores columns that already have a foreign key, and bare id columns', () => {
    const inferred = inferRelationships(schema);
    expect(inferred.some((r) => r.child === 'phones')).toBe(false);
    expect(inferred.some((r) => r.parent === 'audit' || r.child === 'audit')).toBe(false);
  });

  it('never treats a table’s own primary key as a reference', () => {
    // profiles is keyed by contact_id (a one-to-one extension, with a real foreign key).
    const profiles = table(
      'profiles',
      [col('contact_id', 'int unsigned', true)],
      [fk('fk_profile', ['contact_id'], 'contacts', ['contact_id'])],
    );
    const inferred = inferRelationships(schemaOf([contacts, profiles, tickets]));
    // contacts.contact_id is not guessed to reference profiles, and tickets still resolves to contacts.
    expect(inferred.map((r) => `${r.child}>${r.parent}`)).toEqual(['tickets>contacts']);
  });

  it('infers nothing when two tables are equally plausible parents', () => {
    const people = table('people', [col('contact_id', 'int unsigned', true)]);
    expect(inferRelationships(schemaOf([contacts, people, tickets]))).toEqual([]);
  });

  it('matches <table>_id to a table keyed by id', () => {
    const customers = table('customers', [col('id', 'int unsigned', true)]);
    const invoices = table('invoices', [
      col('id', 'int unsigned', true),
      col('customer_id'),
      col('other_id'),
    ]);
    expect(inferRelationships(schemaOf([customers, invoices]))).toEqual([
      expect.objectContaining({
        parent: 'customers',
        child: 'invoices',
        childColumns: ['customer_id'],
        parentColumns: ['id'],
      }),
    ]);
  });

  it('appears in the graph only when enabled, and is marked as inferred', () => {
    const graph = buildGraph(schema, { includeInferred: true, mergeJunctions: false });
    expect(graph.relationships.filter((r) => r.source === 'inferred').map((r) => r.id)).toEqual([
      'inferred:tickets:contact_id',
    ]);
  });
});

describe('computeHighlight', () => {
  const rels = fkGraph.relationships;

  it('highlights nothing without a selection', () => {
    expect(computeHighlight(rels, [], 'direct')).toEqual({ roles: {}, edges: {} });
  });

  it('finds immediate parents and children', () => {
    const { roles, edges } = computeHighlight(rels, ['orders'], 'direct');
    expect(roles).toEqual({ orders: 'selected', contacts: 'parent', items: 'child' });
    expect(Object.keys(edges).sort()).toEqual(['fk:items:fk_item', 'fk:orders:fk_order']);
  });

  it('does not highlight links between two neighbours in direct mode', () => {
    const { edges } = computeHighlight(rels, ['contacts'], 'direct');
    // orders>items joins a child to a grandchild; it does not touch the selection.
    expect(edges).not.toHaveProperty('fk:items:fk_item');
  });

  it('walks all ancestors or all descendants', () => {
    expect(computeHighlight(rels, ['items'], 'parents').roles).toEqual({
      items: 'selected',
      orders: 'parent',
      contacts: 'parent',
    });
    expect(computeHighlight(rels, ['contacts'], 'children').roles).toEqual({
      contacts: 'selected',
      phones: 'child',
      contact_tags: 'child',
      orders: 'child',
      items: 'child',
    });
  });

  it('finds everything connected, in either direction', () => {
    const { roles } = computeHighlight(rels, ['items'], 'connected');
    expect(Object.keys(roles).sort()).toEqual([
      'contact_tags',
      'contacts',
      'items',
      'orders',
      'phones',
      'tags',
    ]);
    expect(roles).not.toHaveProperty('audit');
  });

  it('emphasises relationships between selected tables', () => {
    const { roles, edges } = computeHighlight(rels, ['contacts', 'orders'], 'direct');
    expect(roles.contacts).toBe('selected');
    expect(roles.orders).toBe('selected');
    expect(edges['fk:orders:fk_order']).toBe('strong');
    expect(edges['fk:phones:fk_phone']).toBe('normal');
  });
});

describe('joinOrder', () => {
  it('orders tables so each follows one it is linked to', () => {
    expect(joinOrder(fkGraph.relationships, ['items', 'contacts', 'orders'])).toEqual([
      'items',
      'orders',
      'contacts',
    ]);
  });
  it('keeps unrelated tables, at the end', () => {
    expect(joinOrder(fkGraph.relationships, ['audit', 'orders', 'contacts'])).toEqual([
      'audit',
      'orders',
      'contacts',
    ]);
    expect(joinOrder(fkGraph.relationships, ['orders', 'audit', 'contacts'])).toEqual([
      'orders',
      'contacts',
      'audit',
    ]);
  });
});

describe('node contents', () => {
  const wide = table(
    'wide',
    [col('id', 'int unsigned', true), ...Array.from({ length: 20 }, (_, i) => col(`c${i}`))],
    [fk('fk_w', ['c3'], 'contacts', ['contact_id'])],
  );

  it('lists columns according to the detail level', () => {
    expect(nodeColumns(wide, 'all', undefined)).toMatchObject({ hidden: 9 });
    expect(nodeColumns(wide, 'all', undefined).columns).toHaveLength(12);
    expect(nodeColumns(wide, 'keys', undefined).columns.map((c) => c.name)).toEqual(['id', 'c3']);
    expect(nodeColumns(wide, 'none', undefined)).toEqual({ columns: [], hidden: 21 });
  });
  it('lets a single table be expanded or collapsed against the level', () => {
    expect(nodeColumns(wide, 'none', true).columns).toHaveLength(21);
    expect(nodeColumns(wide, 'all', false).columns).toHaveLength(0);
  });
  it('starts large schemas compact', () => {
    expect([defaultDetail(10), defaultDetail(50), defaultDetail(300)]).toEqual([
      'all',
      'keys',
      'none',
    ]);
  });
});

describe('layoutGraph', () => {
  const size = { width: 200, height: 100 };
  const options = { nodeGap: 20, rankGap: 80 };

  it('places parents to the left of their children', () => {
    const positions = layoutGraph(
      ['contacts', 'orders', 'items'].map((id) => ({ id, ...size })),
      [
        { source: 'contacts', target: 'orders' },
        { source: 'orders', target: 'items' },
      ],
      options,
    );
    expect(positions.contacts!.x).toBeLessThan(positions.orders!.x);
    expect(positions.orders!.x).toBeLessThan(positions.items!.x);
  });

  it('packs unrelated tables into a grid below, without overlaps', () => {
    const nodes = Array.from({ length: 300 }, (_, i) => ({ id: `t${i}`, ...size }));
    const positions = layoutGraph(nodes, [{ source: 't0', target: 't1' }], options);
    expect(Object.keys(positions)).toHaveLength(300);
    const isolated = nodes.slice(2).map((n) => positions[n.id]!);
    expect(Math.min(...isolated.map((p) => p.y))).toBeGreaterThan(positions.t0!.y + size.height);
    expect(new Set(isolated.map((p) => `${p.x},${p.y}`)).size).toBe(298);
    // A grid, not one endless column.
    expect(new Set(isolated.map((p) => p.x)).size).toBeGreaterThan(3);
  });

  it('copes with self-references and unknown endpoints', () => {
    const positions = layoutGraph(
      [{ id: 'a', ...size }],
      [
        { source: 'a', target: 'a' },
        { source: 'a', target: 'ghost' },
      ],
      options,
    );
    expect(positions.a).toEqual({ x: 0, y: 0 });
  });
});
