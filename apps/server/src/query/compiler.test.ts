import type { ColumnInfo, DatabaseSchema, QuerySpec, TableInfo } from '@jarvis/shared';
import { querySpecSchema } from '@jarvis/shared';
import { describe, expect, it } from 'vitest';
import { compileQuery } from './compiler.js';

function column(name: string, dataType = 'varchar'): ColumnInfo {
  return {
    name,
    position: 1,
    dataType,
    columnType: dataType,
    nullable: true,
    defaultValue: null,
    isPrimaryKey: false,
    autoIncrement: false,
    generated: false,
    extra: '',
    comment: '',
    charMaxLength: null,
    numericPrecision: null,
    numericScale: null,
  };
}

function table(name: string, columns: ColumnInfo[]): TableInfo {
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
    primaryKey: [],
    indexes: [],
    foreignKeys: [],
  };
}

const schema: DatabaseSchema = {
  database: 'crm',
  tables: [
    table('ContactDetails', [
      column('contact_id', 'int'),
      column('first_name'),
      column('status'),
      column('age', 'int'),
      column('balance', 'decimal'),
    ]),
    table('ContactPhones', [
      column('phone_id', 'int'),
      column('contact_id', 'int'),
      column('country_code'),
    ]),
    table('ContactEmails', [
      column('email_id', 'int'),
      column('contact_id', 'int'),
      column('email_address'),
    ]),
    table('odd`name', [column('we`ird'), column('question?')]),
  ],
  relationships: [],
  routines: [],
  triggers: [],
  loadedAt: '',
};

const col = (table: string, name: string) => ({ table, column: name });
const colOp = (table: string, name: string) => ({
  kind: 'column' as const,
  column: col(table, name),
});

function spec(overrides: Partial<QuerySpec> = {}): QuerySpec {
  return querySpecSchema.parse({
    distinct: false,
    from: { table: 'ContactDetails', alias: 'ContactDetails' },
    joins: [],
    select: [],
    where: null,
    groupBy: [],
    having: null,
    orderBy: [],
    limit: 100,
    offset: 0,
    ...overrides,
  });
}

const compile = (overrides: Partial<QuerySpec> = {}) => compileQuery(spec(overrides), schema);

describe('compileQuery', () => {
  it('compiles the simplest query', () => {
    expect(compile()).toEqual({
      sql: 'SELECT\n  *\nFROM `crm`.`ContactDetails`\nLIMIT 100',
      params: [],
      displaySql: 'SELECT\n  *\nFROM `crm`.`ContactDetails`\nLIMIT 100',
    });
  });

  it('selects columns with aliases, DISTINCT, ordering and paging', () => {
    const { sql } = compile({
      distinct: true,
      select: [
        { kind: 'column', column: col('ContactDetails', 'first_name'), alias: 'First name' },
        { kind: 'column', column: col('ContactDetails', 'status') },
      ],
      orderBy: [
        { expr: colOp('ContactDetails', 'first_name'), direction: 'asc' },
        { expr: colOp('ContactDetails', 'age'), direction: 'desc' },
      ],
      limit: 25,
      offset: 50,
    });
    expect(sql).toBe(
      [
        'SELECT DISTINCT',
        '  `ContactDetails`.`first_name` AS `First name`,',
        '  `ContactDetails`.`status`',
        'FROM `crm`.`ContactDetails`',
        'ORDER BY `ContactDetails`.`first_name` ASC, `ContactDetails`.`age` DESC',
        'LIMIT 25 OFFSET 50',
      ].join('\n'),
    );
  });

  it('compiles every join type, composite conditions and self joins', () => {
    const { sql } = compile({
      from: { table: 'ContactDetails', alias: 'c' },
      joins: [
        {
          type: 'inner',
          table: 'ContactPhones',
          alias: 'p',
          on: [
            { left: col('c', 'contact_id'), operator: 'eq', right: col('p', 'contact_id') },
            { left: col('c', 'age'), operator: 'gte', right: col('p', 'phone_id') },
          ],
        },
        {
          type: 'left',
          table: 'ContactEmails',
          alias: 'e',
          on: [{ left: col('c', 'contact_id'), operator: 'eq', right: col('e', 'contact_id') }],
        },
        {
          type: 'right',
          table: 'ContactDetails',
          alias: 'manager',
          on: [{ left: col('c', 'age'), operator: 'lt', right: col('manager', 'age') }],
        },
        { type: 'cross', table: 'ContactPhones', alias: 'p2', on: [] },
      ],
    });
    expect(sql).toContain('FROM `crm`.`ContactDetails` AS `c`');
    expect(sql).toContain(
      '  INNER JOIN `crm`.`ContactPhones` AS `p` ON `c`.`contact_id` = `p`.`contact_id` AND `c`.`age` >= `p`.`phone_id`',
    );
    expect(sql).toContain(
      '  LEFT JOIN `crm`.`ContactEmails` AS `e` ON `c`.`contact_id` = `e`.`contact_id`',
    );
    expect(sql).toContain(
      '  RIGHT JOIN `crm`.`ContactDetails` AS `manager` ON `c`.`age` < `manager`.`age`',
    );
    expect(sql).toContain('  CROSS JOIN `crm`.`ContactPhones` AS `p2`');
  });

  it('compiles the nested condition example from the specification', () => {
    const result = compile({
      joins: [
        {
          type: 'left',
          table: 'ContactPhones',
          alias: 'ContactPhones',
          on: [
            {
              left: col('ContactDetails', 'contact_id'),
              operator: 'eq',
              right: col('ContactPhones', 'contact_id'),
            },
          ],
        },
        {
          type: 'left',
          table: 'ContactEmails',
          alias: 'ContactEmails',
          on: [
            {
              left: col('ContactDetails', 'contact_id'),
              operator: 'eq',
              right: col('ContactEmails', 'contact_id'),
            },
          ],
        },
      ],
      where: {
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'status'),
            operator: 'eq',
            right: { kind: 'value', value: 'ACTIVE' },
          },
          {
            kind: 'group',
            op: 'or',
            items: [
              {
                kind: 'condition',
                left: colOp('ContactPhones', 'country_code'),
                operator: 'eq',
                right: { kind: 'value', value: '+91' },
              },
              {
                kind: 'condition',
                left: colOp('ContactEmails', 'email_address'),
                operator: 'like',
                right: { kind: 'value', value: '%@gmail.com' },
              },
            ],
          },
        ],
      },
    });
    expect(result.sql).toContain(
      'WHERE `ContactDetails`.`status` = ?\n  AND (`ContactPhones`.`country_code` = ? OR `ContactEmails`.`email_address` LIKE ?)',
    );
    expect(result.params).toEqual(['ACTIVE', '+91', '%@gmail.com']);
    expect(result.displaySql).toContain(
      "WHERE `ContactDetails`.`status` = 'ACTIVE'\n  AND (`ContactPhones`.`country_code` = '+91' OR `ContactEmails`.`email_address` LIKE '%@gmail.com')",
    );
  });

  it('compiles every operator', () => {
    const cond = (operator: string, extra: object) => ({
      kind: 'condition' as const,
      left: colOp('ContactDetails', 'first_name'),
      operator,
      ...extra,
    });
    const v = (value: string) => ({ right: { kind: 'value', value } });
    const { sql, params } = compile({
      where: {
        kind: 'group',
        op: 'and',
        items: [
          cond('eq', v('a')),
          cond('neq', v('b')),
          cond('gt', v('c')),
          cond('gte', v('d')),
          cond('lt', v('e')),
          cond('lte', v('f')),
          cond('like', v('g%')),
          cond('notLike', v('h%')),
          cond('regexp', v('^i')),
          cond('in', { values: ['j', 'k'] }),
          cond('notIn', { values: ['l'] }),
          cond('between', { range: ['m', 'n'] }),
          cond('notBetween', { range: ['o', 'p'] }),
          cond('isNull', {}),
          cond('isNotNull', {}),
          cond('eq', { right: { kind: 'column', column: col('ContactDetails', 'status') } }),
        ],
      } as QuerySpec['where'],
    });
    const c = '`ContactDetails`.`first_name`';
    expect(sql.split('WHERE ')[1]!.split('\nLIMIT')[0]!.split('\n  AND ')).toEqual([
      `${c} = ?`,
      `${c} <> ?`,
      `${c} > ?`,
      `${c} >= ?`,
      `${c} < ?`,
      `${c} <= ?`,
      `${c} LIKE ?`,
      `${c} NOT LIKE ?`,
      `${c} REGEXP ?`,
      `${c} IN (?, ?)`,
      `${c} NOT IN (?)`,
      `${c} BETWEEN ? AND ?`,
      `${c} NOT BETWEEN ? AND ?`,
      `${c} IS NULL`,
      `${c} IS NOT NULL`,
      `${c} = \`ContactDetails\`.\`status\``,
    ]);
    expect(params).toEqual(
      'abcdefghijklmnop'
        .split('')
        .map((ch, i) => (i === 6 || i === 7 ? `${ch}%` : i === 8 ? `^${ch}` : ch)),
    );
  });

  it('sends numeric text as numbers for numeric columns only', () => {
    const { params, displaySql } = compile({
      where: {
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'age'),
            operator: 'gt',
            right: { kind: 'value', value: '30' },
          },
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'balance'),
            operator: 'between',
            range: ['1.5', '99999999999999999999'],
          },
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'first_name'),
            operator: 'eq',
            right: { kind: 'value', value: '42' },
          },
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'age'),
            operator: 'like',
            right: { kind: 'value', value: '3' },
          },
        ],
      },
    });
    // The 20-digit value stays text so no precision is lost; the LIKE pattern stays text.
    expect(params).toEqual([30, 1.5, '99999999999999999999', '42', '3']);
    expect(displaySql).toContain('`ContactDetails`.`age` > 30');
    expect(displaySql).toContain("`ContactDetails`.`first_name` = '42'");
  });

  it('compiles aggregates, GROUP BY, HAVING and ordering by an aggregate', () => {
    const count = { fn: 'COUNT' as const, column: null, distinct: false };
    const { sql, params } = compile({
      select: [
        { kind: 'column', column: col('ContactDetails', 'status') },
        { kind: 'aggregate', aggregate: count, alias: 'contacts' },
        {
          kind: 'aggregate',
          aggregate: { fn: 'COUNT', column: col('ContactDetails', 'first_name'), distinct: true },
          alias: 'names',
        },
        {
          kind: 'aggregate',
          aggregate: { fn: 'AVG', column: col('ContactDetails', 'age'), distinct: false },
        },
        {
          kind: 'aggregate',
          aggregate: {
            fn: 'GROUP_CONCAT',
            column: col('ContactDetails', 'first_name'),
            distinct: false,
            separator: ' | ',
          },
        },
      ],
      groupBy: [col('ContactDetails', 'status')],
      having: {
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: { kind: 'aggregate', aggregate: count },
            operator: 'gte',
            right: { kind: 'value', value: '2' },
          },
        ],
      },
      orderBy: [{ expr: { kind: 'aggregate', aggregate: count }, direction: 'desc' }],
    });
    expect(sql).toBe(
      [
        'SELECT',
        '  `ContactDetails`.`status`,',
        '  COUNT(*) AS `contacts`,',
        '  COUNT(DISTINCT `ContactDetails`.`first_name`) AS `names`,',
        '  AVG(`ContactDetails`.`age`),',
        "  GROUP_CONCAT(`ContactDetails`.`first_name` SEPARATOR ' | ')",
        'FROM `crm`.`ContactDetails`',
        'GROUP BY `ContactDetails`.`status`',
        'HAVING COUNT(*) >= ?',
        'ORDER BY COUNT(*) DESC',
        'LIMIT 100',
      ].join('\n'),
    );
    expect(params).toEqual([2]);
  });

  it('omits empty condition groups', () => {
    const { sql } = compile({
      where: { kind: 'group', op: 'and', items: [{ kind: 'group', op: 'or', items: [] }] },
    });
    expect(sql).not.toContain('WHERE');
  });
});

describe('compileQuery — safety', () => {
  const hostile = "'; DROP TABLE ContactDetails; --";

  it('never places values in the SQL text', () => {
    const { sql, params } = compile({
      where: {
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'first_name'),
            operator: 'eq',
            right: { kind: 'value', value: hostile },
          },
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'status'),
            operator: 'in',
            values: [hostile, '`'],
          },
        ],
      },
    });
    expect(sql).not.toContain('DROP');
    expect(params).toEqual([hostile, hostile, '`']);
  });

  it('escapes values in the display SQL', () => {
    const { displaySql } = compile({
      where: {
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: colOp('ContactDetails', 'first_name'),
            operator: 'eq',
            right: { kind: 'value', value: "O'Brien" },
          },
        ],
      },
    });
    expect(displaySql).toContain("= 'O\\'Brien'");
  });

  it('rejects tables and columns that are not in the schema', () => {
    expect(() => compile({ from: { table: 'mysql.user', alias: 'u' } })).toThrow(/does not exist/);
    expect(() => compile({ from: { table: 'ContactDetails` WHERE 1=1; --', alias: 'x' } })).toThrow(
      /does not exist/,
    );
    expect(() =>
      compile({
        select: [
          { kind: 'column', column: col('ContactDetails', 'password` FROM mysql.user; --') },
        ],
      }),
    ).toThrow(/does not exist/);
    expect(() =>
      compile({ select: [{ kind: 'column', column: col('Other', 'first_name') }] }),
    ).toThrow(/not a table in this query/);
  });

  it('quotes identifiers that contain backticks or question marks', () => {
    const { sql, displaySql, params } = compile({
      from: { table: 'odd`name', alias: 't' },
      select: [{ kind: 'column', column: col('t', 'we`ird'), alias: 'a`b' }],
      where: {
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: colOp('t', 'question?'),
            operator: 'eq',
            right: { kind: 'value', value: 'x' },
          },
        ],
      },
    });
    expect(sql).toContain('`t`.`we``ird` AS `a``b`');
    expect(sql).toContain('FROM `crm`.`odd``name` AS `t`');
    // The `?` inside the identifier is not mistaken for a placeholder.
    expect(displaySql).toContain("`t`.`question?` = 'x'");
    expect(params).toEqual(['x']);
  });

  it('rejects malformed specs at the schema boundary', () => {
    const base = spec();
    const bad = (patch: object) => querySpecSchema.safeParse({ ...base, ...patch }).success;
    expect(bad({ from: { table: 'ContactDetails', alias: 'a b; DROP' } })).toBe(false);
    expect(bad({ limit: 100000 })).toBe(false);
    expect(bad({ limit: '10; DROP TABLE x' })).toBe(false);
    expect(bad({ offset: -1 })).toBe(false);
    expect(
      bad({ orderBy: [{ expr: colOp('ContactDetails', 'age'), direction: 'asc; DROP' }] }),
    ).toBe(false);
    expect(
      bad({
        select: [{ kind: 'aggregate', aggregate: { fn: 'SLEEP', column: null, distinct: false } }],
      }),
    ).toBe(false);
    expect(
      bad({
        select: [
          {
            kind: 'aggregate',
            aggregate: {
              fn: 'GROUP_CONCAT',
              column: col('ContactDetails', 'age'),
              distinct: false,
              separator: "' , (SELECT 1) '",
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      bad({
        select: [{ kind: 'aggregate', aggregate: { fn: 'SUM', column: null, distinct: false } }],
      }),
    ).toBe(false);
  });

  it('rejects structurally invalid queries', () => {
    const on = [
      {
        left: col('ContactDetails', 'contact_id'),
        operator: 'eq' as const,
        right: col('p', 'contact_id'),
      },
    ];
    expect(() =>
      compile({ joins: [{ type: 'inner', table: 'ContactPhones', alias: 'p', on: [] }] }),
    ).toThrow(/needs at least one condition/);
    expect(() =>
      compile({ joins: [{ type: 'cross', table: 'ContactPhones', alias: 'p', on }] }),
    ).toThrow(/cannot have conditions/);
    expect(() =>
      compile({
        joins: [{ type: 'cross', table: 'ContactPhones', alias: 'contactdetails', on: [] }],
      }),
    ).toThrow(/used more than once/);
    expect(() =>
      compile({
        where: {
          kind: 'group',
          op: 'and',
          items: [
            {
              kind: 'condition',
              left: {
                kind: 'aggregate',
                aggregate: { fn: 'COUNT', column: null, distinct: false },
              },
              operator: 'gt',
              right: { kind: 'value', value: 1 },
            },
          ],
        },
      }),
    ).toThrow(/use HAVING/);
  });
});
