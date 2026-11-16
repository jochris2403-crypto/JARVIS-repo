import { z } from 'zod';

/*
 * The visual query builder never sends SQL. It sends a QuerySpec — a typed
 * description of a SELECT — which the server validates against the real schema
 * and compiles to parameterized SQL (apps/server/src/query/compiler.ts).
 */

/** Rows returned per run. Larger results are paged with OFFSET. */
export const QUERY_MAX_LIMIT = 1000;
export const QUERY_DEFAULT_LIMIT = 100;
export const QUERY_MAX_CONDITION_DEPTH = 6;

/** A table or column name as it exists in the database (checked against the schema server-side). */
const identifierSchema = z.string().min(1).max(64);

/** Table aliases are generated or typed by the user, so they are restricted to a plain identifier. */
export const TABLE_ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,63}$/;
const tableAliasSchema = z
  .string()
  .regex(TABLE_ALIAS_PATTERN, 'Use letters, digits and underscores');

/** Output column alias: free text, quoted by the compiler. */
const outputAliasSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => !v.includes('\0') && v.trim() === v, 'Invalid alias');

export const columnRefSchema = z.object({
  /** Alias of a table in FROM/JOIN. */
  table: tableAliasSchema,
  column: identifierSchema,
});
export type ColumnRef = z.infer<typeof columnRefSchema>;

export const AGGREGATE_FUNCTIONS = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'GROUP_CONCAT',
  'STDDEV_POP',
  'STDDEV_SAMP',
  'VAR_POP',
  'VAR_SAMP',
  'BIT_AND',
  'BIT_OR',
  'BIT_XOR',
] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

/** Aggregates that accept DISTINCT. */
export const DISTINCT_AGGREGATES: readonly AggregateFunction[] = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'GROUP_CONCAT',
];

export const aggregateSchema = z
  .object({
    fn: z.enum(AGGREGATE_FUNCTIONS),
    /** Null means `*`, which only COUNT accepts. */
    column: columnRefSchema.nullable(),
    distinct: z.boolean(),
    /** GROUP_CONCAT separator. Restricted so it can be emitted as a literal in any SQL mode. */
    separator: z
      .string()
      .max(16)
      .regex(/^[^'"\\\0]*$/, 'Separator cannot contain quotes or backslashes')
      .optional(),
  })
  .superRefine((agg, ctx) => {
    if (agg.column === null && agg.fn !== 'COUNT') {
      ctx.addIssue({ code: 'custom', message: `${agg.fn} needs a column`, path: ['column'] });
    }
    if (agg.column === null && agg.distinct) {
      ctx.addIssue({ code: 'custom', message: 'COUNT(DISTINCT) needs a column', path: ['column'] });
    }
    if (agg.distinct && !DISTINCT_AGGREGATES.includes(agg.fn)) {
      ctx.addIssue({
        code: 'custom',
        message: `${agg.fn} does not support DISTINCT`,
        path: ['distinct'],
      });
    }
    if (agg.separator !== undefined && agg.fn !== 'GROUP_CONCAT') {
      ctx.addIssue({
        code: 'custom',
        message: 'Only GROUP_CONCAT has a separator',
        path: ['separator'],
      });
    }
  });
export type AggregateExpr = z.infer<typeof aggregateSchema>;

/** The left side of a condition, or a sort key. Aggregates are valid in HAVING and ORDER BY only. */
export const operandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('column'), column: columnRefSchema }),
  z.object({ kind: z.literal('aggregate'), aggregate: aggregateSchema }),
]);
export type Operand = z.infer<typeof operandSchema>;

/** A literal. Always sent to MySQL as a bound parameter, never spliced into SQL. */
export const scalarSchema = z.union([z.string().max(65_535), z.number().finite(), z.boolean()]);
export type Scalar = z.infer<typeof scalarSchema>;

export const COMPARISON_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
export const PATTERN_OPERATORS = ['like', 'notLike', 'regexp'] as const;
export const LIST_OPERATORS = ['in', 'notIn'] as const;
export const RANGE_OPERATORS = ['between', 'notBetween'] as const;
export const NULL_OPERATORS = ['isNull', 'isNotNull'] as const;
export const CONDITION_OPERATORS = [
  ...COMPARISON_OPERATORS,
  ...PATTERN_OPERATORS,
  ...LIST_OPERATORS,
  ...RANGE_OPERATORS,
  ...NULL_OPERATORS,
] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** SQL text of each operator, shared by the compiler and the UI. */
export const OPERATOR_SQL: Record<ConditionOperator, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  notLike: 'NOT LIKE',
  regexp: 'REGEXP',
  in: 'IN',
  notIn: 'NOT IN',
  between: 'BETWEEN',
  notBetween: 'NOT BETWEEN',
  isNull: 'IS NULL',
  isNotNull: 'IS NOT NULL',
};

const includes = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);
export const isComparisonOperator = (op: string) => includes(COMPARISON_OPERATORS, op);
export const isPatternOperator = (op: string) => includes(PATTERN_OPERATORS, op);
export const isListOperator = (op: string) => includes(LIST_OPERATORS, op);
export const isRangeOperator = (op: string) => includes(RANGE_OPERATORS, op);
export const isNullOperator = (op: string) => includes(NULL_OPERATORS, op);

export interface Condition {
  kind: 'condition';
  left: Operand;
  operator: ConditionOperator;
  /** Comparison and pattern operators: a literal, or (comparisons only) another column. */
  right?: { kind: 'value'; value: Scalar } | { kind: 'column'; column: ColumnRef };
  /** IN / NOT IN. */
  values?: Scalar[];
  /** BETWEEN / NOT BETWEEN. */
  range?: [Scalar, Scalar];
}

export interface ConditionGroup {
  kind: 'group';
  op: 'and' | 'or';
  items: (Condition | ConditionGroup)[];
}

export const conditionSchema: z.ZodType<Condition> = z
  .object({
    kind: z.literal('condition'),
    left: operandSchema,
    operator: z.enum(CONDITION_OPERATORS),
    right: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('value'), value: scalarSchema }),
        z.object({ kind: z.literal('column'), column: columnRefSchema }),
      ])
      .optional(),
    values: z.array(scalarSchema).min(1).max(1000).optional(),
    range: z.tuple([scalarSchema, scalarSchema]).optional(),
  })
  .superRefine((c, ctx) => {
    const needs = (field: 'right' | 'values' | 'range') => {
      if (c[field] === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `${OPERATOR_SQL[c.operator]} needs a value`,
          path: [field],
        });
      }
    };
    if (isComparisonOperator(c.operator)) needs('right');
    else if (isPatternOperator(c.operator)) {
      needs('right');
      if (c.right?.kind === 'column') {
        ctx.addIssue({ code: 'custom', message: 'Pattern must be a value', path: ['right'] });
      }
    } else if (isListOperator(c.operator)) needs('values');
    else if (isRangeOperator(c.operator)) needs('range');
  });

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    kind: z.literal('group'),
    op: z.enum(['and', 'or']),
    items: z.array(z.union([conditionSchema, conditionGroupSchema])).max(100),
  }),
);

export const JOIN_TYPES = ['inner', 'left', 'right', 'cross'] as const;
export type JoinType = (typeof JOIN_TYPES)[number];

export const joinSchema = z.object({
  type: z.enum(JOIN_TYPES),
  table: identifierSchema,
  alias: tableAliasSchema,
  /** Conditions are ANDed. Must be empty for CROSS JOIN and non-empty otherwise. */
  on: z
    .array(
      z.object({
        left: columnRefSchema,
        operator: z.enum(COMPARISON_OPERATORS),
        right: columnRefSchema,
      }),
    )
    .max(16),
});
export type JoinSpec = z.infer<typeof joinSchema>;

export const selectItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('column'),
    column: columnRefSchema,
    alias: outputAliasSchema.optional(),
  }),
  z.object({
    kind: z.literal('aggregate'),
    aggregate: aggregateSchema,
    alias: outputAliasSchema.optional(),
  }),
]);
export type SelectItem = z.infer<typeof selectItemSchema>;

export const querySpecSchema = z.object({
  distinct: z.boolean(),
  from: z.object({ table: identifierSchema, alias: tableAliasSchema }),
  joins: z.array(joinSchema).max(15),
  /** Empty means every column of every table (`SELECT *`). */
  select: z.array(selectItemSchema).max(200),
  where: conditionGroupSchema.nullable(),
  groupBy: z.array(columnRefSchema).max(32),
  having: conditionGroupSchema.nullable(),
  orderBy: z.array(z.object({ expr: operandSchema, direction: z.enum(['asc', 'desc']) })).max(16),
  limit: z.number().int().min(1).max(QUERY_MAX_LIMIT),
  offset: z.number().int().min(0).max(1_000_000_000),
});
export type QuerySpec = z.infer<typeof querySpecSchema>;

export const compiledQuerySchema = z.object({
  /** Exactly what is sent to MySQL: values appear as `?` placeholders. */
  sql: z.string(),
  params: z.array(scalarSchema),
  /** The same statement with values written inline, for reading and copying. */
  displaySql: z.string(),
});
export type CompiledQuery = z.infer<typeof compiledQuerySchema>;

export const queryExecuteRequestSchema = z.object({
  query: querySpecSchema,
  /** Client-generated id, used to cancel the run. */
  executionId: z.uuid(),
});

/** A result cell. Binary data is summarised rather than sent in full. */
export const cellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ binary: z.string(), bytes: z.number() }),
]);
export type Cell = z.infer<typeof cellSchema>;

export const resultColumnSchema = z.object({
  name: z.string(),
  /** Alias of the table the column comes from; null for computed columns. */
  table: z.string().nullable(),
  dataType: z.string(),
  numeric: z.boolean(),
});
export type ResultColumn = z.infer<typeof resultColumnSchema>;

export const queryResultSchema = z.object({
  sql: z.string(),
  displaySql: z.string(),
  columns: z.array(resultColumnSchema),
  rows: z.array(z.array(cellSchema)),
  rowCount: z.number(),
  durationMs: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type QueryResult = z.infer<typeof queryResultSchema>;

export const queryCancelResponseSchema = z.object({ cancelled: z.boolean() });
