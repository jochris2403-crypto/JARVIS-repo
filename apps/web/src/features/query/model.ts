import {
  QUERY_DEFAULT_LIMIT,
  QUERY_MAX_LIMIT,
  TABLE_ALIAS_PATTERN,
  isComparisonOperator,
  isListOperator,
  isNullOperator,
  isPatternOperator,
  isRangeOperator,
  type AggregateExpr,
  type AggregateFunction,
  type ColumnRef,
  type ComparisonOperator,
  type Condition,
  type ConditionGroup,
  type ConditionOperator,
  type DatabaseSchema,
  type JoinType,
  type Operand,
  type QuerySpec,
  type TableInfo,
} from '@jarvis/shared';

/*
 * The query builder's editing model.
 *
 * It differs from the wire format (QuerySpec) in two ways: every list item has
 * a stable id for React, and clauses refer to tables by node id rather than by
 * alias, so renaming an alias or removing a table updates everything that
 * depends on it. All functions here are pure: state in, new state out.
 */

let sequence = 0;
export const newId = (prefix: string): string => `${prefix}${(++sequence).toString(36)}`;

export interface JoinOn {
  id: string;
  /** A table earlier in the query. Empty while unset. */
  leftTableId: string;
  leftColumn: string;
  operator: ComparisonOperator;
  /** A column of the table being joined. */
  rightColumn: string;
}

export interface TableNode {
  id: string;
  table: string;
  alias: string;
  /** Null for the first table (FROM). */
  join: { type: JoinType; on: JoinOn[] } | null;
}

export interface ColumnPick {
  id: string;
  tableId: string;
  column: string;
  alias: string;
}

export interface AggregatePick {
  id: string;
  fn: AggregateFunction;
  /** Empty table and column mean `*` (COUNT only). */
  tableId: string;
  column: string;
  distinct: boolean;
  alias: string;
  separator: string;
}

export type OperandRef =
  { kind: 'column'; tableId: string; column: string } | { kind: 'aggregate'; aggregateId: string };

export interface ConditionNode {
  kind: 'condition';
  id: string;
  left: OperandRef | null;
  operator: ConditionOperator;
  /** Comparison operators can compare against a value or another column. */
  rightKind: 'value' | 'column';
  value: string;
  /** Upper bound for BETWEEN. */
  value2: string;
  /** Values for IN. */
  values: string[];
  rightColumn: { tableId: string; column: string } | null;
}

export interface GroupNode {
  kind: 'group';
  id: string;
  op: 'and' | 'or';
  items: (ConditionNode | GroupNode)[];
}

export interface SortPick {
  id: string;
  target: OperandRef | null;
  direction: 'asc' | 'desc';
}

export interface BuilderState {
  tables: TableNode[];
  distinct: boolean;
  columns: ColumnPick[];
  aggregates: AggregatePick[];
  where: GroupNode;
  groupBy: { tableId: string; column: string }[];
  having: GroupNode;
  orderBy: SortPick[];
  /** Kept as text while the user types. */
  limit: string;
  offset: string;
}

export type ConditionTree = 'where' | 'having';

const emptyGroup = (): GroupNode => ({ kind: 'group', id: newId('g'), op: 'and', items: [] });

export function emptyState(): BuilderState {
  return {
    tables: [],
    distinct: false,
    columns: [],
    aggregates: [],
    where: emptyGroup(),
    groupBy: [],
    having: emptyGroup(),
    orderBy: [],
    limit: String(QUERY_DEFAULT_LIMIT),
    offset: '0',
  };
}

export const findTable = (schema: DatabaseSchema, name: string): TableInfo | undefined =>
  schema.tables.find((t) => t.name === name);

// ───────────────────────────── Tables and joins ─────────────────────────────

export interface JoinSuggestion {
  /** The foreign-key constraint this suggestion comes from. */
  constraintName: string;
  leftTableId: string;
  pairs: { leftColumn: string; rightColumn: string }[];
}

/**
 * Ways to join `tableName` to the tables already in the query, taken from
 * declared foreign keys in either direction. Composite keys yield one
 * suggestion with several column pairs.
 */
export function suggestJoins(
  existing: readonly TableNode[],
  schema: DatabaseSchema,
  tableName: string,
): JoinSuggestion[] {
  const suggestions: JoinSuggestion[] = [];
  for (const node of existing) {
    for (const rel of schema.relationships) {
      if (rel.toSchema !== schema.database) continue;
      if (rel.fromTable === tableName && rel.toTable === node.table) {
        // The new table is the child: existing.parentKey = new.foreignKey
        suggestions.push({
          constraintName: rel.constraintName,
          leftTableId: node.id,
          pairs: rel.toColumns.map((leftColumn, i) => ({
            leftColumn,
            rightColumn: rel.fromColumns[i]!,
          })),
        });
      } else if (rel.toTable === tableName && rel.fromTable === node.table) {
        // The new table is the parent: existing.foreignKey = new.parentKey
        suggestions.push({
          constraintName: rel.constraintName,
          leftTableId: node.id,
          pairs: rel.fromColumns.map((leftColumn, i) => ({
            leftColumn,
            rightColumn: rel.toColumns[i]!,
          })),
        });
      }
    }
  }
  return suggestions;
}

const toJoinOn = (s: JoinSuggestion): JoinOn[] =>
  s.pairs.map((pair) => ({
    id: newId('on'),
    leftTableId: s.leftTableId,
    leftColumn: pair.leftColumn,
    operator: 'eq',
    rightColumn: pair.rightColumn,
  }));

const blankJoinOn = (): JoinOn => ({
  id: newId('on'),
  leftTableId: '',
  leftColumn: '',
  operator: 'eq',
  rightColumn: '',
});

function uniqueAlias(tables: readonly TableNode[], base: string): string {
  const taken = new Set(tables.map((t) => t.alias.toLowerCase()));
  // Table names can contain characters an alias may not; fall back to a neutral name.
  const root = TABLE_ALIAS_PATTERN.test(base) ? base : 't';
  if (!taken.has(root.toLowerCase())) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root.slice(0, 60)}_${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Adds a table. The first becomes FROM; later ones are joined, using a foreign
 * key when one links the new table to a table already in the query.
 */
export function addTable(
  state: BuilderState,
  schema: DatabaseSchema,
  tableName: string,
): BuilderState {
  if (!findTable(schema, tableName)) return state;
  const node: TableNode = {
    id: newId('t'),
    table: tableName,
    alias: uniqueAlias(state.tables, tableName),
    join: null,
  };
  if (state.tables.length > 0) {
    const [suggestion] = suggestJoins(state.tables, schema, tableName);
    node.join = { type: 'inner', on: suggestion ? toJoinOn(suggestion) : [blankJoinOn()] };
  }
  return { ...state, tables: [...state.tables, node] };
}

export function applyJoinSuggestion(
  state: BuilderState,
  tableId: string,
  suggestion: JoinSuggestion,
): BuilderState {
  return updateTable(state, tableId, (t) =>
    t.join
      ? {
          ...t,
          join: { type: t.join.type === 'cross' ? 'inner' : t.join.type, on: toJoinOn(suggestion) },
        }
      : t,
  );
}

export function updateTable(
  state: BuilderState,
  id: string,
  fn: (table: TableNode) => TableNode,
): BuilderState {
  return { ...state, tables: state.tables.map((t) => (t.id === id ? fn(t) : t)) };
}

export function setJoinType(state: BuilderState, id: string, type: JoinType): BuilderState {
  return updateTable(state, id, (t) => {
    if (!t.join) return t;
    if (type === 'cross') return { ...t, join: { type, on: [] } };
    return { ...t, join: { type, on: t.join.on.length > 0 ? t.join.on : [blankJoinOn()] } };
  });
}

export function addJoinCondition(state: BuilderState, id: string): BuilderState {
  return updateTable(state, id, (t) =>
    t.join ? { ...t, join: { ...t.join, on: [...t.join.on, blankJoinOn()] } } : t,
  );
}

export function updateJoinCondition(
  state: BuilderState,
  tableId: string,
  conditionId: string,
  patch: Partial<JoinOn>,
): BuilderState {
  return updateTable(state, tableId, (t) =>
    t.join
      ? {
          ...t,
          join: {
            ...t.join,
            on: t.join.on.map((c) => (c.id === conditionId ? { ...c, ...patch } : c)),
          },
        }
      : t,
  );
}

export function removeJoinCondition(
  state: BuilderState,
  tableId: string,
  conditionId: string,
): BuilderState {
  return updateTable(state, tableId, (t) =>
    t.join ? { ...t, join: { ...t.join, on: t.join.on.filter((c) => c.id !== conditionId) } } : t,
  );
}

const usesTable = (
  ref: OperandRef | null,
  tableId: string,
  removedAggregates: Set<string>,
): boolean =>
  ref !== null &&
  (ref.kind === 'column' ? ref.tableId === tableId : removedAggregates.has(ref.aggregateId));

function pruneGroup(group: GroupNode, drop: (c: ConditionNode) => boolean): GroupNode {
  return {
    ...group,
    items: group.items.flatMap((item): (ConditionNode | GroupNode)[] => {
      if (item.kind === 'group') return [pruneGroup(item, drop)];
      return drop(item) ? [] : [item];
    }),
  };
}

/** Removes a table and everything in the query that refers to it. */
export function removeTable(state: BuilderState, id: string): BuilderState {
  const remaining = state.tables.filter((t) => t.id !== id);
  const tables = remaining.map((t, index) => {
    // The new first table becomes FROM.
    if (index === 0) return { ...t, join: null };
    if (!t.join) return t;
    return { ...t, join: { ...t.join, on: t.join.on.filter((c) => c.leftTableId !== id) } };
  });
  const removedAggregates = new Set(
    state.aggregates.filter((a) => a.tableId === id).map((a) => a.id),
  );
  const dropCondition = (c: ConditionNode) =>
    usesTable(c.left, id, removedAggregates) || c.rightColumn?.tableId === id;

  return {
    ...state,
    tables,
    columns: state.columns.filter((c) => c.tableId !== id),
    aggregates: state.aggregates.filter((a) => a.tableId !== id),
    where: pruneGroup(state.where, dropCondition),
    having: pruneGroup(state.having, dropCondition),
    groupBy: state.groupBy.filter((g) => g.tableId !== id),
    orderBy: state.orderBy.filter((o) => !usesTable(o.target, id, removedAggregates)),
  };
}

// ───────────────────────────────── Columns ─────────────────────────────────

export const isColumnSelected = (state: BuilderState, tableId: string, column: string): boolean =>
  state.columns.some((c) => c.tableId === tableId && c.column === column);

export function toggleColumn(state: BuilderState, tableId: string, column: string): BuilderState {
  if (isColumnSelected(state, tableId, column)) {
    return {
      ...state,
      columns: state.columns.filter((c) => !(c.tableId === tableId && c.column === column)),
    };
  }
  return { ...state, columns: [...state.columns, { id: newId('c'), tableId, column, alias: '' }] };
}

export function setTableColumns(
  state: BuilderState,
  tableId: string,
  columns: readonly string[],
): BuilderState {
  const kept = state.columns.filter((c) => c.tableId !== tableId || columns.includes(c.column));
  const present = new Set(kept.filter((c) => c.tableId === tableId).map((c) => c.column));
  const added = columns
    .filter((column) => !present.has(column))
    .map((column) => ({ id: newId('c'), tableId, column, alias: '' }));
  return { ...state, columns: [...kept, ...added] };
}

export function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}

// ──────────────────────────────── Aggregates ────────────────────────────────

export function addAggregate(state: BuilderState): BuilderState {
  const aggregate: AggregatePick = {
    id: newId('a'),
    fn: 'COUNT',
    tableId: '',
    column: '',
    distinct: false,
    alias: '',
    separator: ',',
  };
  return { ...state, aggregates: [...state.aggregates, aggregate] };
}

export function removeAggregate(state: BuilderState, id: string): BuilderState {
  const refersTo = (ref: OperandRef | null) => ref?.kind === 'aggregate' && ref.aggregateId === id;
  return {
    ...state,
    aggregates: state.aggregates.filter((a) => a.id !== id),
    having: pruneGroup(state.having, (c) => refersTo(c.left)),
    orderBy: state.orderBy.filter((o) => !refersTo(o.target)),
  };
}

/** Selected plain columns that are not grouped — invalid alongside aggregates in strict SQL mode. */
export function ungroupedColumns(state: BuilderState): ColumnPick[] {
  if (state.aggregates.length === 0 && state.groupBy.length === 0) return [];
  return state.columns.filter(
    (c) => !state.groupBy.some((g) => g.tableId === c.tableId && g.column === c.column),
  );
}

export function groupBySelectedColumns(state: BuilderState): BuilderState {
  const additions = ungroupedColumns(state).map(({ tableId, column }) => ({ tableId, column }));
  return { ...state, groupBy: [...state.groupBy, ...additions] };
}

// ──────────────────────────────── Conditions ────────────────────────────────

export function newCondition(): ConditionNode {
  return {
    kind: 'condition',
    id: newId('w'),
    left: null,
    operator: 'eq',
    rightKind: 'value',
    value: '',
    value2: '',
    values: [],
    rightColumn: null,
  };
}

function mapGroups(group: GroupNode, fn: (g: GroupNode) => GroupNode): GroupNode {
  const mapped = fn(group);
  return {
    ...mapped,
    items: mapped.items.map((item) => (item.kind === 'group' ? mapGroups(item, fn) : item)),
  };
}

export function addToGroup(
  root: GroupNode,
  groupId: string,
  node: ConditionNode | GroupNode,
): GroupNode {
  return mapGroups(root, (g) => (g.id === groupId ? { ...g, items: [...g.items, node] } : g));
}

export const addCondition = (root: GroupNode, groupId: string) =>
  addToGroup(root, groupId, newCondition());

/** A new nested group starts with one empty condition and the opposite operator of its parent. */
export function addGroup(root: GroupNode, groupId: string): GroupNode {
  return mapGroups(root, (g) =>
    g.id === groupId
      ? {
          ...g,
          items: [
            ...g.items,
            {
              kind: 'group',
              id: newId('g'),
              op: g.op === 'and' ? 'or' : 'and',
              items: [newCondition()],
            },
          ],
        }
      : g,
  );
}

export function updateGroup(
  root: GroupNode,
  groupId: string,
  patch: Partial<Pick<GroupNode, 'op'>>,
): GroupNode {
  return mapGroups(root, (g) => (g.id === groupId ? { ...g, ...patch } : g));
}

export function updateCondition(
  root: GroupNode,
  id: string,
  patch: Partial<ConditionNode>,
): GroupNode {
  return mapGroups(root, (g) => ({
    ...g,
    items: g.items.map((item) =>
      item.kind === 'condition' && item.id === id ? { ...item, ...patch } : item,
    ),
  }));
}

export function removeNode(root: GroupNode, id: string): GroupNode {
  return mapGroups(root, (g) => ({ ...g, items: g.items.filter((item) => item.id !== id) }));
}

export function countConditions(group: GroupNode): number {
  return group.items.reduce(
    (n, item) => n + (item.kind === 'group' ? countConditions(item) : 1),
    0,
  );
}

// ───────────────────────── Validation and compilation ─────────────────────────

export type BuilderSection = 'tables' | 'columns' | 'filters' | 'aggregates' | 'sort';

export interface BuilderIssue {
  section: BuilderSection;
  message: string;
}

function conditionProblem(c: ConditionNode): string | null {
  if (!c.left) return 'choose a column';
  if (isNullOperator(c.operator)) return null;
  if (isListOperator(c.operator)) return c.values.length === 0 ? 'add at least one value' : null;
  if (isRangeOperator(c.operator))
    return c.value === '' || c.value2 === '' ? 'enter both values' : null;
  if (isComparisonOperator(c.operator) && c.rightKind === 'column') {
    return c.rightColumn ? null : 'choose the column to compare with';
  }
  if (isPatternOperator(c.operator) && c.value === '') return 'enter a pattern';
  return null;
}

function groupProblems(
  group: GroupNode,
  label: string,
  section: BuilderSection,
  out: BuilderIssue[],
): void {
  for (const item of group.items) {
    if (item.kind === 'group') groupProblems(item, label, section, out);
    else {
      const problem = conditionProblem(item);
      if (problem) out.push({ section, message: `${label}: ${problem}.` });
    }
  }
}

/**
 * Checks that the builder state describes a complete query. Only when this
 * returns no issues is the state sent to the server for compilation.
 */
export function validate(state: BuilderState, schema: DatabaseSchema): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  const aliases = new Set<string>();

  for (const table of state.tables) {
    const info = findTable(schema, table.table);
    if (!info) {
      issues.push({
        section: 'tables',
        message: `Table ${table.table} no longer exists in ${schema.database}.`,
      });
      continue;
    }
    if (!TABLE_ALIAS_PATTERN.test(table.alias)) {
      issues.push({
        section: 'tables',
        message: `The alias for ${table.table} may only use letters, digits and underscores.`,
      });
    } else if (aliases.has(table.alias.toLowerCase())) {
      issues.push({
        section: 'tables',
        message: `The alias “${table.alias}” is used by more than one table.`,
      });
    }
    aliases.add(table.alias.toLowerCase());

    if (table.join && table.join.type !== 'cross') {
      const incomplete = table.join.on.some(
        (c) => !c.leftTableId || !c.leftColumn || !c.rightColumn,
      );
      if (table.join.on.length === 0 || incomplete) {
        issues.push({
          section: 'tables',
          message: `Choose the columns that join ${table.alias} to the query.`,
        });
      }
    }
  }

  groupProblems(state.where, 'Filter', 'filters', issues);
  groupProblems(state.having, 'Group filter', 'aggregates', issues);

  for (const aggregate of state.aggregates) {
    if (!aggregate.column && (aggregate.fn !== 'COUNT' || aggregate.distinct)) {
      const name = aggregate.fn === 'COUNT' ? 'COUNT DISTINCT' : aggregate.fn;
      issues.push({ section: 'aggregates', message: `${name} needs a column.` });
    }
    if (aggregate.fn === 'GROUP_CONCAT' && /['"\\]/.test(aggregate.separator)) {
      issues.push({
        section: 'aggregates',
        message: 'The GROUP_CONCAT separator cannot contain quotes or backslashes.',
      });
    }
  }

  if (state.orderBy.some((o) => !o.target)) {
    issues.push({ section: 'sort', message: 'Choose what to sort by.' });
  }
  const limit = Number(state.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > QUERY_MAX_LIMIT) {
    issues.push({
      section: 'sort',
      message: `Limit must be a whole number from 1 to ${QUERY_MAX_LIMIT}.`,
    });
  }
  const offset = Number(state.offset);
  if (state.offset.trim() === '' || !Number.isInteger(offset) || offset < 0) {
    issues.push({ section: 'sort', message: 'Offset must be zero or a positive whole number.' });
  }
  return issues;
}

/** Converts a validated builder state to the wire format. Call only when `validate` reports no issues. */
export function toSpec(state: BuilderState): QuerySpec {
  const aliasOf = new Map(state.tables.map((t) => [t.id, t.alias]));
  const ref = (tableId: string, column: string): ColumnRef => ({
    table: aliasOf.get(tableId) ?? '',
    column,
  });

  const aggregateExpr = (a: AggregatePick): AggregateExpr => ({
    fn: a.fn,
    column: a.column ? ref(a.tableId, a.column) : null,
    distinct: a.distinct,
    ...(a.fn === 'GROUP_CONCAT' ? { separator: a.separator } : {}),
  });
  const aggregateById = new Map(state.aggregates.map((a) => [a.id, a]));

  const operand = (o: OperandRef): Operand => {
    if (o.kind === 'column') return { kind: 'column', column: ref(o.tableId, o.column) };
    return { kind: 'aggregate', aggregate: aggregateExpr(aggregateById.get(o.aggregateId)!) };
  };

  const condition = (c: ConditionNode): Condition => {
    const base = { kind: 'condition' as const, left: operand(c.left!), operator: c.operator };
    if (isNullOperator(c.operator)) return base;
    if (isListOperator(c.operator)) return { ...base, values: c.values };
    if (isRangeOperator(c.operator)) return { ...base, range: [c.value, c.value2] };
    if (isComparisonOperator(c.operator) && c.rightKind === 'column' && c.rightColumn) {
      return {
        ...base,
        right: { kind: 'column', column: ref(c.rightColumn.tableId, c.rightColumn.column) },
      };
    }
    return { ...base, right: { kind: 'value', value: c.value } };
  };

  const group = (g: GroupNode): ConditionGroup => ({
    kind: 'group',
    op: g.op,
    items: g.items.map((item) => (item.kind === 'group' ? group(item) : condition(item))),
  });

  const [from, ...joined] = state.tables;
  return {
    distinct: state.distinct,
    from: { table: from!.table, alias: from!.alias },
    joins: joined.map((t) => ({
      type: t.join!.type,
      table: t.table,
      alias: t.alias,
      on: t.join!.on.map((c) => ({
        left: ref(c.leftTableId, c.leftColumn),
        operator: c.operator,
        right: { table: t.alias, column: c.rightColumn },
      })),
    })),
    select: [
      ...state.columns.map((c) => ({
        kind: 'column' as const,
        column: ref(c.tableId, c.column),
        ...(c.alias.trim() ? { alias: c.alias.trim() } : {}),
      })),
      ...state.aggregates.map((a) => ({
        kind: 'aggregate' as const,
        aggregate: aggregateExpr(a),
        ...(a.alias.trim() ? { alias: a.alias.trim() } : {}),
      })),
    ],
    where: countConditions(state.where) > 0 ? group(state.where) : null,
    groupBy: state.groupBy.map((g) => ref(g.tableId, g.column)),
    having: countConditions(state.having) > 0 ? group(state.having) : null,
    orderBy: state.orderBy.map((o) => ({ expr: operand(o.target!), direction: o.direction })),
    limit: Number(state.limit),
    offset: Number(state.offset),
  };
}

// ───────────────────────────── Display helpers ─────────────────────────────

export function aggregateLabel(state: BuilderState, a: AggregatePick): string {
  const alias = state.tables.find((t) => t.id === a.tableId)?.alias;
  const target = a.column ? `${alias}.${a.column}` : '*';
  return `${a.fn}(${a.distinct ? 'DISTINCT ' : ''}${target})`;
}

/** Encodes an operand as a `<select>` value. U+0001 cannot occur in ids or column names. */
const SEP = '\u0001';
export function encodeOperand(
  ref: OperandRef | { tableId: string; column: string } | null,
): string {
  if (!ref) return '';
  if ('kind' in ref && ref.kind === 'aggregate') return `a${SEP}${ref.aggregateId}`;
  return `c${SEP}${ref.tableId}${SEP}${ref.column}`;
}

export function decodeOperand(value: string): OperandRef | null {
  const [kind, first, second] = value.split(SEP);
  if (kind === 'a' && first) return { kind: 'aggregate', aggregateId: first };
  if (kind === 'c' && first && second !== undefined)
    return { kind: 'column', tableId: first, column: second };
  return null;
}
