import type { DatabaseSchema, TableInfo } from '@jarvis/shared';

/*
 * The relationship diagram's model of a schema. Pure functions only.
 *
 * Three kinds of relationship are drawn, and they are never mixed up:
 *  - `foreign-key`   a declared FOREIGN KEY constraint — guaranteed by MySQL.
 *  - `many-to-many`  two foreign keys through a junction table, shown as one
 *                    link when "merge junction tables" is on. Still backed by
 *                    real constraints.
 *  - `inferred`      a guess from matching column names and types. Not
 *                    enforced by the database; opt-in and always labelled.
 */

export type RelationshipSource = 'foreign-key' | 'many-to-many' | 'inferred';
export type Cardinality = 'one-to-one' | 'many-to-one' | 'many-to-many';

export interface ErdRelationship {
  id: string;
  source: RelationshipSource;
  /** The referenced table. For many-to-many, one of the two sides. */
  parent: string;
  /** The table holding the foreign key. For many-to-many, the other side. */
  child: string;
  parentColumns: string[];
  childColumns: string[];
  /** Read from the child: each child row has one parent (`many-to-one`) or is the only one (`one-to-one`). */
  cardinality: Cardinality;
  constraintName?: string;
  /** Junction table of a many-to-many link. */
  via?: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface JunctionTable {
  table: string;
  /** The two tables it links. */
  left: string;
  right: string;
}

export interface ErdGraph {
  /** Tables drawn as nodes (merged junction tables are left out). */
  tables: TableInfo[];
  relationships: ErdRelationship[];
  junctions: JunctionTable[];
  /** Foreign keys that point into another database and so cannot be drawn. */
  external: { table: string; constraintName: string; target: string }[];
}

/**
 * A junction table exists only to link two others: it has exactly two foreign
 * keys, to two different tables, and every column of its primary key is one
 * of the foreign-key columns.
 */
export function findJunctionTables(schema: DatabaseSchema): JunctionTable[] {
  const junctions: JunctionTable[] = [];
  for (const table of schema.tables) {
    const fks = table.foreignKeys.filter((fk) => fk.referencedSchema === schema.database);
    if (fks.length !== 2 || table.foreignKeys.length !== 2) continue;
    const [a, b] = fks as [(typeof fks)[number], (typeof fks)[number]];
    if (a.referencedTable === b.referencedTable) continue;
    const fkColumns = new Set([...a.columns, ...b.columns]);
    const keyIsLinks =
      table.primaryKey.length > 0 && table.primaryKey.every((c) => fkColumns.has(c));
    // A junction carries no data of its own beyond the two keys.
    const onlyLinks = table.columns.every((c) => fkColumns.has(c.name));
    if (keyIsLinks && onlyLinks) {
      junctions.push({ table: table.name, left: a.referencedTable, right: b.referencedTable });
    }
  }
  return junctions;
}

/** Normalises a type for comparison: `int(10) unsigned` and `int unsigned` are the same key type. */
const keyType = (columnType: string): string =>
  columnType
    .toLowerCase()
    .replace(/\(\d+\)/g, '')
    .trim();

const singular = (name: string): string => name.toLowerCase().replace(/(es|s)$/, '');

/**
 * Guesses relationships that have no foreign key, from naming conventions:
 *
 *  1. A column with the same name and type as another table's single-column
 *     primary key (e.g. `tickets.contact_id` ↔ `contacts.contact_id`).
 *  2. A column named `<table>_id` whose type matches that table's `id` key
 *     (e.g. `orders.customer_id` ↔ `customers.id`).
 *
 * Deliberately conservative: bare `id` columns never match; columns that are
 * a primary key or already belong to a foreign key are left alone; and when
 * more than one table could be the parent, nothing is inferred. The result is
 * a hint for people, never a constraint.
 */
export function inferRelationships(schema: DatabaseSchema): ErdRelationship[] {
  // Candidate parents own their key: a single-column primary key that is not itself a
  // foreign key. (A table keyed by another table's key is a one-to-one extension of it.)
  const owners = schema.tables.filter(
    (t) =>
      t.type === 'table' &&
      t.primaryKey.length === 1 &&
      !t.foreignKeys.some((fk) => fk.columns.includes(t.primaryKey[0]!)),
  );
  const inferred: ErdRelationship[] = [];

  for (const table of schema.tables) {
    if (table.type !== 'table') continue;
    const constrained = new Set(table.foreignKeys.flatMap((fk) => fk.columns));

    for (const column of table.columns) {
      // A table's own key is an identity, not a reference to guess at.
      if (constrained.has(column.name) || column.isPrimaryKey) continue;
      const name = column.name.toLowerCase();

      const candidates = owners.filter((candidate) => {
        if (candidate.name === table.name) return false;
        const pk = candidate.columns.find((c) => c.name === candidate.primaryKey[0]);
        if (!pk || keyType(pk.columnType) !== keyType(column.columnType)) return false;
        const pkName = pk.name.toLowerCase();
        if (pkName !== 'id') return pkName === name; // rule 1
        return (
          name === `${singular(candidate.name)}_id` || name === `${candidate.name.toLowerCase()}_id`
        ); // rule 2
      });
      // Two tables with an equally plausible claim: say nothing rather than guess wrong.
      if (candidates.length !== 1) continue;
      const parent = candidates[0]!;

      const unique = table.indexes.some(
        (i) =>
          i.unique &&
          i.columns.length === 1 &&
          i.columns[0]?.name === column.name &&
          i.columns[0].subPart === null,
      );
      inferred.push({
        id: `inferred:${table.name}:${column.name}`,
        source: 'inferred',
        parent: parent.name,
        child: table.name,
        parentColumns: [parent.primaryKey[0]!],
        childColumns: [column.name],
        cardinality: unique ? 'one-to-one' : 'many-to-one',
      });
    }
  }
  return inferred;
}

export function buildGraph(
  schema: DatabaseSchema,
  options: { includeInferred: boolean; mergeJunctions: boolean },
): ErdGraph {
  const names = new Set(schema.tables.map((t) => t.name));
  const junctions = findJunctionTables(schema);
  const merged = new Set(options.mergeJunctions ? junctions.map((j) => j.table) : []);
  const relationships: ErdRelationship[] = [];
  const external: ErdGraph['external'] = [];

  for (const rel of schema.relationships) {
    if (rel.toSchema !== schema.database || !names.has(rel.toTable)) {
      external.push({
        table: rel.fromTable,
        constraintName: rel.constraintName,
        target: `${rel.toSchema}.${rel.toTable}`,
      });
      continue;
    }
    if (merged.has(rel.fromTable)) continue;
    relationships.push({
      id: rel.id,
      source: 'foreign-key',
      parent: rel.toTable,
      child: rel.fromTable,
      parentColumns: rel.toColumns,
      childColumns: rel.fromColumns,
      cardinality: rel.cardinality,
      constraintName: rel.constraintName,
      onDelete: rel.onDelete,
      onUpdate: rel.onUpdate,
    });
  }

  for (const junction of junctions) {
    if (!merged.has(junction.table)) continue;
    relationships.push({
      id: `m2m:${junction.table}`,
      source: 'many-to-many',
      parent: junction.left,
      child: junction.right,
      parentColumns: [],
      childColumns: [],
      cardinality: 'many-to-many',
      via: junction.table,
    });
  }

  if (options.includeInferred) {
    relationships.push(
      ...inferRelationships(schema).filter((r) => !merged.has(r.child) && !merged.has(r.parent)),
    );
  }

  return {
    tables: schema.tables.filter((t) => !merged.has(t.name)),
    relationships,
    junctions,
    external,
  };
}

/** One-line description, e.g. `ContactPhones.contact_id → ContactDetails.contact_id`. */
export function describeRelationship(rel: ErdRelationship): string {
  if (rel.source === 'many-to-many') return `${rel.parent} ⟷ ${rel.child} via ${rel.via}`;
  return `${rel.child}.${rel.childColumns.join(', ')} → ${rel.parent}.${rel.parentColumns.join(', ')}`;
}

// ─────────────────────────────── Highlighting ───────────────────────────────

export type HighlightMode = 'direct' | 'parents' | 'children' | 'connected';
/** How a table relates to the current selection. */
export type Role = 'selected' | 'parent' | 'child' | 'both' | 'connected';

export interface Highlight {
  roles: Record<string, Role>;
  /** Relationship ids to emphasise; `strong` links two selected tables. */
  edges: Record<string, 'normal' | 'strong'>;
}

function walk(start: Iterable<string>, next: (table: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    for (const neighbour of next(queue.pop()!)) {
      if (!seen.has(neighbour)) {
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
  }
  return seen;
}

/**
 * Works out which tables and relationships to highlight for a selection.
 *
 *  - `direct`     immediate parents and children of the selected tables
 *  - `parents`    everything the selection depends on, transitively
 *  - `children`   everything that depends on the selection, transitively
 *  - `connected`  every table reachable through any chain of relationships
 */
export function computeHighlight(
  relationships: readonly ErdRelationship[],
  selected: readonly string[],
  mode: HighlightMode,
): Highlight {
  const roles: Record<string, Role> = {};
  const edges: Record<string, 'normal' | 'strong'> = {};
  if (selected.length === 0) return { roles, edges };

  const chosen = new Set(selected);
  const parentsOf = (t: string) => relationships.filter((r) => r.child === t).map((r) => r.parent);
  const childrenOf = (t: string) => relationships.filter((r) => r.parent === t).map((r) => r.child);

  let parents = new Set<string>();
  let children = new Set<string>();
  let connected = new Set<string>();
  if (mode === 'direct') {
    parents = new Set(selected.flatMap(parentsOf));
    children = new Set(selected.flatMap(childrenOf));
  } else if (mode === 'parents') {
    parents = walk(selected, parentsOf);
  } else if (mode === 'children') {
    children = walk(selected, childrenOf);
  } else {
    connected = walk(selected, (t) => [...parentsOf(t), ...childrenOf(t)]);
  }

  for (const t of connected) roles[t] = 'connected';
  for (const t of parents) roles[t] = 'parent';
  for (const t of children) roles[t] = roles[t] === 'parent' ? 'both' : 'child';
  for (const t of chosen) roles[t] = 'selected';

  for (const rel of relationships) {
    const bothSelected = chosen.has(rel.parent) && chosen.has(rel.child);
    const bothShown = rel.parent in roles && rel.child in roles;
    // In direct mode only links that touch the selection matter, not links between two neighbours.
    const relevant = mode === 'direct' ? chosen.has(rel.parent) || chosen.has(rel.child) : true;
    if (bothSelected) edges[rel.id] = 'strong';
    else if (bothShown && relevant) edges[rel.id] = 'normal';
  }
  return { roles, edges };
}

/**
 * Orders tables so each one, where possible, follows a table it is linked to
 * by a real foreign key — the order in which the query builder can join them.
 */
export function joinOrder(
  relationships: readonly ErdRelationship[],
  tables: readonly string[],
): string[] {
  const links = relationships.filter((r) => r.source === 'foreign-key');
  const linked = (a: string, b: string) =>
    links.some((r) => (r.parent === a && r.child === b) || (r.parent === b && r.child === a));
  const remaining = [...tables];
  const ordered: string[] = [];
  while (remaining.length > 0) {
    const index =
      ordered.length === 0 ? 0 : remaining.findIndex((t) => ordered.some((o) => linked(o, t)));
    ordered.push(...remaining.splice(index === -1 ? 0 : index, 1));
  }
  return ordered;
}

// ─────────────────────────────── Node contents ───────────────────────────────

export type DetailLevel = 'all' | 'keys' | 'none';

/** Columns listed before a table node is cut off with "+N more". */
export const MAX_LISTED_COLUMNS = 12;

export interface NodeColumns {
  columns: TableInfo['columns'];
  /** Columns not listed. */
  hidden: number;
}

/**
 * The columns a table node lists. `override` is the per-node expand/collapse
 * state: true shows every column, false none, undefined follows `detail`.
 */
export function nodeColumns(
  table: TableInfo,
  detail: DetailLevel,
  override: boolean | undefined,
): NodeColumns {
  if (override === true) return { columns: table.columns, hidden: 0 };
  if (override === false || detail === 'none') return { columns: [], hidden: table.columns.length };
  if (detail === 'keys') {
    const fk = new Set(table.foreignKeys.flatMap((k) => k.columns));
    const keys = table.columns.filter((c) => c.isPrimaryKey || fk.has(c.name));
    return { columns: keys, hidden: table.columns.length - keys.length };
  }
  const listed = table.columns.slice(0, MAX_LISTED_COLUMNS);
  return { columns: listed, hidden: table.columns.length - listed.length };
}

/** Sensible default detail for a schema of this size: big schemas start compact. */
export function defaultDetail(tableCount: number): DetailLevel {
  if (tableCount > 120) return 'none';
  if (tableCount > 30) return 'keys';
  return 'all';
}
