import { querySpecSchema } from '@jarvis/shared';
import { describe, expect, it } from 'vitest';
import { DEMO_SCHEMA } from '@/test/fake-api';
import {
  addAggregate,
  addCondition,
  addGroup,
  addTable,
  emptyState,
  groupBySelectedColumns,
  removeTable,
  setJoinType,
  suggestJoins,
  toSpec,
  toggleColumn,
  ungroupedColumns,
  updateCondition,
  updateTable,
  validate,
  type BuilderState,
  type ConditionNode,
  type GroupNode,
} from './model';

const schema = DEMO_SCHEMA;
const withTables = (...names: string[]): BuilderState =>
  names.reduce((state, name) => addTable(state, schema, name), emptyState());
const firstCondition = (group: GroupNode) =>
  group.items.find((i): i is ConditionNode => i.kind === 'condition')!;

describe('adding tables', () => {
  it('makes the first table FROM and joins later ones on their foreign key', () => {
    const state = withTables('customers', 'orders');
    const [customers, orders] = state.tables;
    expect(customers).toMatchObject({ table: 'customers', alias: 'customers', join: null });
    expect(orders!.join).toMatchObject({
      type: 'inner',
      on: [
        {
          leftTableId: customers!.id,
          leftColumn: 'id',
          operator: 'eq',
          rightColumn: 'customer_id',
        },
      ],
    });
  });

  it('finds the key in either direction', () => {
    const state = withTables('orders', 'customers');
    expect(state.tables[1]!.join!.on[0]).toMatchObject({
      leftColumn: 'customer_id',
      rightColumn: 'id',
    });
  });

  it('leaves the join for the user to complete when no foreign key exists', () => {
    const state = withTables('customers', 'recent_orders');
    expect(state.tables[1]!.join!.on).toEqual([
      expect.objectContaining({ leftTableId: '', rightColumn: '' }),
    ]);
    expect(suggestJoins(state.tables.slice(0, 1), schema, 'recent_orders')).toEqual([]);
    expect(validate(state, schema)).toEqual([
      { section: 'tables', message: 'Choose the columns that join recent_orders to the query.' },
    ]);
    expect(validate(setJoinType(state, state.tables[1]!.id, 'cross'), schema)).toEqual([]);
  });

  it('gives a repeated table a distinct alias (self join)', () => {
    const state = withTables('customers', 'customers');
    expect(state.tables.map((t) => t.alias)).toEqual(['customers', 'customers_2']);
  });
});

describe('removing a table', () => {
  it('removes everything that referred to it and promotes the next table to FROM', () => {
    let state = withTables('customers', 'orders');
    const [customers, orders] = state.tables;
    state = toggleColumn(state, customers!.id, 'name');
    state = toggleColumn(state, orders!.id, 'total');
    state = {
      ...state,
      where: addCondition(state.where, state.where.id),
      groupBy: [{ tableId: customers!.id, column: 'name' }],
    };
    state = {
      ...state,
      where: updateCondition(state.where, firstCondition(state.where).id, {
        left: { kind: 'column', tableId: customers!.id, column: 'name' },
      }),
      orderBy: [
        {
          id: 'o1',
          target: { kind: 'column', tableId: customers!.id, column: 'name' },
          direction: 'asc',
        },
      ],
    };

    const after = removeTable(state, customers!.id);
    expect(after.tables).toEqual([expect.objectContaining({ table: 'orders', join: null })]);
    expect(after.columns.map((c) => c.column)).toEqual(['total']);
    expect(after.where.items).toEqual([]);
    expect(after.groupBy).toEqual([]);
    expect(after.orderBy).toEqual([]);
    expect(validate(after, schema)).toEqual([]);
  });
});

describe('validate', () => {
  it('reports incomplete conditions, bad aliases and bad limits', () => {
    let state = withTables('customers');
    state = {
      ...state,
      where: addCondition(state.where, state.where.id),
      limit: '5000',
      offset: '-1',
    };
    state = updateTable(state, state.tables[0]!.id, (t) => ({ ...t, alias: 'my table' }));
    expect(validate(state, schema).map((i) => i.message)).toEqual([
      'The alias for customers may only use letters, digits and underscores.',
      'Filter: choose a column.',
      'Limit must be a whole number from 1 to 1000.',
      'Offset must be zero or a positive whole number.',
    ]);
  });

  it('flags tables that disappeared from the schema', () => {
    const state = withTables('customers');
    const without = { ...schema, tables: schema.tables.filter((t) => t.name !== 'customers') };
    expect(validate(state, without)[0]!.message).toBe('Table customers no longer exists in shop.');
  });
});

describe('grouping helpers', () => {
  it('detects selected columns that are not grouped and can group them', () => {
    let state = withTables('customers');
    state = toggleColumn(state, state.tables[0]!.id, 'country');
    expect(ungroupedColumns(state)).toEqual([]);
    state = addAggregate(state);
    expect(ungroupedColumns(state).map((c) => c.column)).toEqual(['country']);
    state = groupBySelectedColumns(state);
    expect(state.groupBy).toEqual([{ tableId: state.tables[0]!.id, column: 'country' }]);
    expect(ungroupedColumns(state)).toEqual([]);
  });
});

describe('toSpec', () => {
  it('produces a schema-valid QuerySpec that follows alias renames', () => {
    let state = withTables('customers', 'orders');
    const [customers, orders] = state.tables;
    state = updateTable(state, customers!.id, (t) => ({ ...t, alias: 'c' }));
    state = toggleColumn(state, customers!.id, 'name');
    state = { ...state, columns: state.columns.map((c) => ({ ...c, alias: ' Customer ' })) };
    state = addAggregate(state);
    const aggregate = state.aggregates[0]!;
    state = {
      ...state,
      distinct: true,
      aggregates: [
        { ...aggregate, fn: 'SUM', tableId: orders!.id, column: 'total', alias: 'spent' },
      ],
      groupBy: [{ tableId: customers!.id, column: 'name' }],
      orderBy: [
        { id: 'o1', target: { kind: 'aggregate', aggregateId: aggregate.id }, direction: 'desc' },
      ],
      limit: '10',
      offset: '20',
    };

    // WHERE: country = 'IN' AND (total > 100 OR total IS NULL)
    let where = addCondition(state.where, state.where.id);
    where = updateCondition(where, firstCondition(where).id, {
      left: { kind: 'column', tableId: customers!.id, column: 'country' },
      value: 'IN',
    });
    where = addGroup(where, where.id);
    const nested = where.items.find((i): i is GroupNode => i.kind === 'group')!;
    where = updateCondition(where, firstCondition(nested).id, {
      left: { kind: 'column', tableId: orders!.id, column: 'total' },
      operator: 'gt',
      value: '100',
    });
    where = addCondition(where, nested.id);
    const second = (
      where.items.find((i): i is GroupNode => i.kind === 'group')!.items[1] as ConditionNode
    ).id;
    where = updateCondition(where, second, {
      left: { kind: 'column', tableId: orders!.id, column: 'total' },
      operator: 'isNull',
    });
    state = { ...state, where };

    expect(validate(state, schema)).toEqual([]);
    const spec = toSpec(state);
    expect(querySpecSchema.safeParse(spec).success).toBe(true);
    const total = { table: 'orders', column: 'total' };
    const sum = { fn: 'SUM', column: total, distinct: false };
    expect(spec).toEqual({
      distinct: true,
      from: { table: 'customers', alias: 'c' },
      joins: [
        {
          type: 'inner',
          table: 'orders',
          alias: 'orders',
          on: [
            {
              left: { table: 'c', column: 'id' },
              operator: 'eq',
              right: { table: 'orders', column: 'customer_id' },
            },
          ],
        },
      ],
      select: [
        { kind: 'column', column: { table: 'c', column: 'name' }, alias: 'Customer' },
        { kind: 'aggregate', aggregate: sum, alias: 'spent' },
      ],
      where: {
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: { kind: 'column', column: { table: 'c', column: 'country' } },
            operator: 'eq',
            right: { kind: 'value', value: 'IN' },
          },
          {
            kind: 'group',
            op: 'or',
            items: [
              {
                kind: 'condition',
                left: { kind: 'column', column: total },
                operator: 'gt',
                right: { kind: 'value', value: '100' },
              },
              { kind: 'condition', left: { kind: 'column', column: total }, operator: 'isNull' },
            ],
          },
        ],
      },
      groupBy: [{ table: 'c', column: 'name' }],
      having: null,
      orderBy: [{ expr: { kind: 'aggregate', aggregate: sum }, direction: 'desc' }],
      limit: 10,
      offset: 20,
    });
  });
});
