import mysql from 'mysql2/promise';
import {
  OPERATOR_SQL,
  QUERY_MAX_CONDITION_DEPTH,
  isComparisonOperator,
  isListOperator,
  isNullOperator,
  isRangeOperator,
  type AggregateExpr,
  type ColumnInfo,
  type ColumnRef,
  type CompiledQuery,
  type Condition,
  type ConditionGroup,
  type DatabaseSchema,
  type Operand,
  type QuerySpec,
  type Scalar,
  type TableInfo,
} from '@jarvis/shared';
import { AppError } from '../errors/app-error.js';
import { quoteIdentifier as q } from './identifiers.js';

/*
 * QuerySpec → SQL.
 *
 * Safety model:
 *  - Table and column names must exist in the introspected schema; anything
 *    else is rejected before any SQL is produced.
 *  - Identifiers are emitted only through quoteIdentifier().
 *  - Every literal becomes a `?` parameter. The only values written into the
 *    SQL text are LIMIT/OFFSET (validated integers), keywords chosen from
 *    fixed tables, and the GROUP_CONCAT separator (restricted by the schema
 *    to characters that are safe inside a string literal in any SQL mode).
 *  - `displaySql` inlines escaped values for humans to read; it is never executed.
 */

const NUMERIC_TYPES = new Set([
  'tinyint',
  'smallint',
  'mediumint',
  'int',
  'integer',
  'bigint',
  'decimal',
  'numeric',
  'float',
  'double',
  'real',
  'year',
]);
const NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/;
const JOIN_SQL = {
  inner: 'INNER JOIN',
  left: 'LEFT JOIN',
  right: 'RIGHT JOIN',
  cross: 'CROSS JOIN',
};
/** Aggregates whose result is numeric whatever the input column is. */
const NUMERIC_AGGREGATES = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'STDDEV_POP',
  'STDDEV_SAMP',
  'VAR_POP',
  'VAR_SAMP',
  'BIT_AND',
  'BIT_OR',
  'BIT_XOR',
]);

function invalid(message: string): never {
  throw new AppError('VALIDATION_FAILED', message);
}

interface Compiled {
  sql: string;
  /** Whether values compared with this expression should be sent as numbers. */
  numeric: boolean;
}

class Compiler {
  private readonly params: Scalar[] = [];
  private readonly tables = new Map<string, TableInfo>();

  constructor(private readonly schema: DatabaseSchema) {}

  compile(spec: QuerySpec): CompiledQuery {
    const lines: string[] = [];

    // FROM and JOIN are resolved first: every other clause refers to their aliases.
    const from = this.registerTable(spec.from.table, spec.from.alias);
    const joins = spec.joins.map((join) => {
      const target = this.registerTable(join.table, join.alias);
      if (join.type === 'cross') {
        if (join.on.length > 0) invalid('A CROSS JOIN cannot have conditions');
        return `  ${JOIN_SQL.cross} ${target}`;
      }
      if (join.on.length === 0) {
        invalid(`The join to "${join.alias}" needs at least one condition`);
      }
      const on = join.on
        .map(
          (c) =>
            `${this.column(c.left).sql} ${OPERATOR_SQL[c.operator]} ${this.column(c.right).sql}`,
        )
        .join(' AND ');
      return `  ${JOIN_SQL[join.type]} ${target} ON ${on}`;
    });

    const selectList =
      spec.select.length === 0
        ? ['*']
        : spec.select.map((item) => {
            const expr =
              item.kind === 'column'
                ? this.column(item.column).sql
                : this.aggregate(item.aggregate).sql;
            return item.alias ? `${expr} AS ${q(item.alias)}` : expr;
          });
    lines.push(spec.distinct ? 'SELECT DISTINCT' : 'SELECT');
    lines.push(selectList.map((item) => `  ${item}`).join(',\n'));
    lines.push(`FROM ${from}`, ...joins);

    const where = spec.where ? this.group(spec.where, false, 0, true) : null;
    if (where) lines.push(`WHERE ${where}`);

    if (spec.groupBy.length > 0) {
      lines.push(`GROUP BY ${spec.groupBy.map((ref) => this.column(ref).sql).join(', ')}`);
    }

    const having = spec.having ? this.group(spec.having, true, 0, true) : null;
    if (having) lines.push(`HAVING ${having}`);

    if (spec.orderBy.length > 0) {
      const keys = spec.orderBy.map(
        (key) => `${this.operand(key.expr, true).sql} ${key.direction === 'desc' ? 'DESC' : 'ASC'}`,
      );
      lines.push(`ORDER BY ${keys.join(', ')}`);
    }

    // Validated integers (see querySpecSchema); placeholders in LIMIT are unreliable in prepared statements.
    lines.push(
      `LIMIT ${Math.trunc(spec.limit)}${spec.offset > 0 ? ` OFFSET ${Math.trunc(spec.offset)}` : ''}`,
    );

    const template = lines.join('\n');
    return {
      sql: template.replace(PLACEHOLDER, '?'),
      params: this.params,
      displaySql: template.replace(PLACEHOLDER, (_, index: string) =>
        mysql.escape(this.params[Number(index)]),
      ),
    };
  }

  /** Validates a table and alias, and returns its FROM/JOIN fragment. */
  private registerTable(name: string, alias: string): string {
    const table = this.schema.tables.find((t) => t.name === name);
    if (!table) invalid(`Table "${name}" does not exist in ${this.schema.database}`);
    // MySQL table aliases are case-insensitive on some platforms; treat them so everywhere.
    const key = alias.toLowerCase();
    if (this.tables.has(key)) invalid(`The alias "${alias}" is used more than once`);
    this.tables.set(key, table);
    const qualified = `${q(this.schema.database)}.${q(table.name)}`;
    return alias === table.name ? qualified : `${qualified} AS ${q(alias)}`;
  }

  private column(ref: ColumnRef): Compiled & { info: ColumnInfo } {
    const table = this.tables.get(ref.table.toLowerCase());
    if (!table) invalid(`"${ref.table}" is not a table in this query`);
    const info = table.columns.find((c) => c.name === ref.column);
    if (!info) invalid(`Column "${ref.column}" does not exist in ${table.name}`);
    return {
      sql: `${q(ref.table)}.${q(info.name)}`,
      numeric: NUMERIC_TYPES.has(info.dataType.toLowerCase()),
      info,
    };
  }

  private aggregate(agg: AggregateExpr): Compiled {
    const inner = agg.column ? this.column(agg.column) : null;
    const distinct = agg.distinct ? 'DISTINCT ' : '';
    // The separator pattern (no quotes, backslashes or NUL) makes this literal safe in any SQL mode.
    const separator =
      agg.fn === 'GROUP_CONCAT' && agg.separator !== undefined
        ? ` SEPARATOR '${agg.separator}'`
        : '';
    return {
      sql: `${agg.fn}(${distinct}${inner ? inner.sql : '*'}${separator})`,
      numeric:
        NUMERIC_AGGREGATES.has(agg.fn) || (agg.fn !== 'GROUP_CONCAT' && (inner?.numeric ?? false)),
    };
  }

  private operand(operand: Operand, allowAggregate: boolean): Compiled {
    if (operand.kind === 'column') return this.column(operand.column);
    if (!allowAggregate) invalid('Aggregates cannot be used in WHERE; use HAVING');
    return this.aggregate(operand.aggregate);
  }

  /**
   * Binds a literal. Numeric-looking text compared with a numeric expression is
   * sent as a number so it reads naturally (`age > 30`, not `age > '30'`);
   * values that would lose precision as a JS number stay as text and MySQL
   * converts them.
   */
  private bind(value: Scalar, numeric: boolean): string {
    let bound = value;
    if (numeric && typeof value === 'string' && NUMERIC_LITERAL.test(value.trim())) {
      const n = Number(value);
      if (Number.isFinite(n) && String(n) === value.trim()) bound = n;
    }
    this.params.push(bound);
    return `\u0000${this.params.length - 1}\u0000`;
  }

  private condition(c: Condition, allowAggregate: boolean): string {
    const left = this.operand(c.left, allowAggregate);
    const op = OPERATOR_SQL[c.operator];

    if (isNullOperator(c.operator)) return `${left.sql} ${op}`;
    if (isListOperator(c.operator)) {
      if (!c.values?.length) invalid(`${op} needs at least one value`);
      return `${left.sql} ${op} (${c.values.map((v) => this.bind(v, left.numeric)).join(', ')})`;
    }
    if (isRangeOperator(c.operator)) {
      if (!c.range) invalid(`${op} needs two values`);
      return `${left.sql} ${op} ${this.bind(c.range[0], left.numeric)} AND ${this.bind(c.range[1], left.numeric)}`;
    }
    if (!c.right) invalid(`${op} needs a value`);
    if (c.right.kind === 'column') {
      if (!isComparisonOperator(c.operator)) invalid(`${op} needs a value, not a column`);
      return `${left.sql} ${op} ${this.column(c.right.column).sql}`;
    }
    // Patterns are always text, even against numeric columns.
    return `${left.sql} ${op} ${this.bind(c.right.value, left.numeric && isComparisonOperator(c.operator))}`;
  }

  /** Renders a condition group, or null when it contains no conditions. */
  private group(
    group: ConditionGroup,
    allowAggregate: boolean,
    depth: number,
    top = false,
  ): string | null {
    if (depth > QUERY_MAX_CONDITION_DEPTH) invalid('Conditions are nested too deeply');
    const parts: string[] = [];
    for (const item of group.items) {
      if (item.kind === 'condition') {
        parts.push(this.condition(item, allowAggregate));
      } else {
        const inner = this.group(item, allowAggregate, depth + 1);
        // Parenthesise nested groups so precedence is always explicit.
        if (inner) parts.push(item.items.length > 1 ? `(${inner})` : inner);
      }
    }
    if (parts.length === 0) return null;
    const op = group.op === 'or' ? 'OR' : 'AND';
    return parts.join(top ? `\n  ${op} ` : ` ${op} `);
  }
}

// NUL never appears in generated SQL (identifiers reject it), so it safely delimits parameter slots.
// eslint-disable-next-line no-control-regex
const PLACEHOLDER = /\u0000(\d+)\u0000/g;

/** Compiles a validated QuerySpec against the schema of the database it targets. */
export function compileQuery(spec: QuerySpec, schema: DatabaseSchema): CompiledQuery {
  return new Compiler(schema).compile(spec);
}
