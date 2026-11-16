import {
  JOIN_TYPES,
  OPERATOR_SQL,
  COMPARISON_OPERATORS,
  type ComparisonOperator,
  type DatabaseSchema,
  type JoinType,
} from '@jarvis/shared';
import { Link2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useQueryStore } from '@/stores/query-store';
import {
  addJoinCondition,
  addTable,
  applyJoinSuggestion,
  decodeOperand,
  encodeOperand,
  findTable,
  removeJoinCondition,
  removeTable,
  setJoinType,
  suggestJoins,
  updateJoinCondition,
  updateTable,
  type BuilderState,
  type TableNode,
} from './model';
import { Hint, OperandSelect, RemoveButton, Section } from './parts';

const JOIN_LABEL: Record<JoinType, string> = {
  inner: 'INNER JOIN',
  left: 'LEFT JOIN',
  right: 'RIGHT JOIN',
  cross: 'CROSS JOIN',
};

/** Tables in the query that have a foreign key to or from a table not yet in it. */
function relatedTables(state: BuilderState, schema: DatabaseSchema): string[] {
  const present = new Set(state.tables.map((t) => t.table));
  const related = new Set<string>();
  for (const rel of schema.relationships) {
    if (present.has(rel.fromTable) && !present.has(rel.toTable)) related.add(rel.toTable);
    if (present.has(rel.toTable) && !present.has(rel.fromTable)) related.add(rel.fromTable);
  }
  return [...related].filter((name) => findTable(schema, name)).sort();
}

export function TablesSection({ schema, hasIssue }: { schema: DatabaseSchema; hasIssue: boolean }) {
  const state = useQueryStore((s) => s.builder);
  const update = useQueryStore((s) => s.update);
  const related = relatedTables(state, schema);

  return (
    <Section
      step={1}
      title="Tables and joins"
      summary={
        state.tables.length > 0
          ? `${state.tables.length} table${state.tables.length === 1 ? '' : 's'}`
          : undefined
      }
      hasIssue={hasIssue}
    >
      {state.tables.length > 1 && <JoinMap tables={state.tables} />}

      <ul className="flex flex-col gap-2" aria-label="Tables in query">
        {state.tables.map((table, index) => (
          <TableCard key={table.id} table={table} index={index} schema={schema} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Add table"
          value=""
          onChange={(e) => e.target.value && update((b) => addTable(b, schema, e.target.value))}
          className="w-52"
        >
          <option value="">
            {state.tables.length === 0 ? 'Choose a table…' : 'Add another table…'}
          </option>
          {schema.tables.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
              {t.type === 'view' ? ' (view)' : ''}
            </option>
          ))}
        </Select>
        {related.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Related tables">
            <span className="text-2xs text-fg-subtle">Related:</span>
            {related.map((name) => (
              <Button
                key={name}
                size="xs"
                onClick={() => update((b) => addTable(b, schema, name))}
                aria-label={`Add related table ${name}`}
              >
                <Plus /> <span className="font-mono">{name}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
      {state.tables.length > 0 && (
        <Hint>Add the same table twice to join it to itself — each copy gets its own alias.</Hint>
      )}
    </Section>
  );
}

/** Compact picture of how the tables are chained together. */
function JoinMap({ tables }: { tables: readonly TableNode[] }) {
  return (
    <div
      aria-label="Join overview"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-border bg-bg px-2.5 py-2"
    >
      {tables.map((table) => (
        <span key={table.id} className="flex items-center gap-1.5">
          {table.join && (
            <span className="flex items-center gap-1 text-2xs text-fg-subtle">
              <span aria-hidden className="h-px w-3 bg-border-strong" />
              <span className={table.join.type === 'cross' ? 'text-warning' : 'text-accent'}>
                {table.join.type.toUpperCase()}
              </span>
              <span aria-hidden className="h-px w-3 bg-border-strong" />
            </span>
          )}
          <span className="rounded-sm border border-border-strong bg-surface-raised px-1.5 py-0.5 font-mono text-2xs text-fg">
            {table.alias}
          </span>
        </span>
      ))}
    </div>
  );
}

function TableCard({
  table,
  index,
  schema,
}: {
  table: TableNode;
  index: number;
  schema: DatabaseSchema;
}) {
  const state = useQueryStore((s) => s.builder);
  const update = useQueryStore((s) => s.update);
  const earlier = state.tables.slice(0, index);
  const columns = findTable(schema, table.table)?.columns ?? [];
  const suggestions = table.join ? suggestJoins(earlier, schema, table.table) : [];
  const aliasId = `alias-${table.id}`;

  return (
    <li className="rounded-md border border-border bg-bg">
      <div className="flex flex-wrap items-center gap-2 p-2">
        {table.join ? (
          <Select
            aria-label={`Join type for ${table.alias}`}
            value={table.join.type}
            onChange={(e) => update((b) => setJoinType(b, table.id, e.target.value as JoinType))}
            className="w-28"
          >
            {JOIN_TYPES.map((type) => (
              <option key={type} value={type}>
                {JOIN_LABEL[type]}
              </option>
            ))}
          </Select>
        ) : (
          <Badge tone="accent">FROM</Badge>
        )}
        <span className="font-mono text-xs text-fg">{table.table}</span>
        <label htmlFor={aliasId} className="ml-auto text-2xs text-fg-subtle">
          as
        </label>
        <Input
          id={aliasId}
          aria-label={`Alias for ${table.table}`}
          value={table.alias}
          onChange={(e) =>
            update((b) => updateTable(b, table.id, (t) => ({ ...t, alias: e.target.value })))
          }
          spellCheck={false}
          className="h-7 w-32 font-mono text-xs"
        />
        <RemoveButton
          label={`Remove ${table.alias}`}
          onClick={() => update((b) => removeTable(b, table.id))}
        />
      </div>

      {table.join && table.join.type === 'cross' && (
        <div className="border-t border-border px-2.5 py-2">
          <Hint tone="warning">
            A cross join pairs every row of {table.alias} with every row of the other tables.
          </Hint>
        </div>
      )}

      {table.join && table.join.type !== 'cross' && (
        <div className="flex flex-col gap-1.5 border-t border-border p-2">
          {table.join.on.map((on, i) => (
            <div key={on.id} className="flex items-center gap-1.5">
              <span className="w-7 shrink-0 text-right text-2xs text-fg-subtle">
                {i === 0 ? 'ON' : 'AND'}
              </span>
              <OperandSelect
                aria-label={`Join column from earlier table (${table.alias}, condition ${i + 1})`}
                value={
                  on.leftTableId
                    ? encodeOperand({ tableId: on.leftTableId, column: on.leftColumn })
                    : ''
                }
                onChange={(encoded) => {
                  const ref = decodeOperand(encoded);
                  update((b) =>
                    updateJoinCondition(b, table.id, on.id, {
                      leftTableId: ref?.kind === 'column' ? ref.tableId : '',
                      leftColumn: ref?.kind === 'column' ? ref.column : '',
                    }),
                  );
                }}
                tables={earlier}
                schema={schema}
                state={state}
                placeholder="Column…"
                className="flex-1"
              />
              <Select
                aria-label="Join operator"
                value={on.operator}
                onChange={(e) =>
                  update((b) =>
                    updateJoinCondition(b, table.id, on.id, {
                      operator: e.target.value as ComparisonOperator,
                    }),
                  )
                }
                className="w-14"
              >
                {COMPARISON_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {OPERATOR_SQL[op]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={`Join column of ${table.alias} (condition ${i + 1})`}
                value={on.rightColumn}
                onChange={(e) =>
                  update((b) =>
                    updateJoinCondition(b, table.id, on.id, { rightColumn: e.target.value }),
                  )
                }
                className="flex-1"
              >
                <option value="">Column…</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {table.alias}.{c.name}
                  </option>
                ))}
              </Select>
              <RemoveButton
                label="Remove join condition"
                onClick={() => update((b) => removeJoinCondition(b, table.id, on.id))}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 pl-8">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => update((b) => addJoinCondition(b, table.id))}
            >
              <Plus /> Condition
            </Button>
            {suggestions.map((s) => {
              const left = earlier.find((t) => t.id === s.leftTableId);
              return (
                <Button
                  key={`${s.constraintName}:${s.leftTableId}`}
                  size="xs"
                  variant="ghost"
                  title={`Join on foreign key ${s.constraintName}`}
                  onClick={() => update((b) => applyJoinSuggestion(b, table.id, s))}
                >
                  <Link2 /> Use key to {left?.alias}
                </Button>
              );
            })}
          </div>
          {suggestions.length === 0 && (
            <Hint>
              No foreign key links {table.table} to the tables above, so choose the join columns
              yourself.
            </Hint>
          )}
        </div>
      )}
    </li>
  );
}
