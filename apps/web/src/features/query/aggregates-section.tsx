import {
  AGGREGATE_FUNCTIONS,
  DISTINCT_AGGREGATES,
  type AggregateFunction,
  type DatabaseSchema,
} from '@jarvis/shared';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useQueryStore } from '@/stores/query-store';
import { ConditionEditor } from './condition-editor';
import {
  addAggregate,
  aggregateLabel,
  countConditions,
  decodeOperand,
  encodeOperand,
  groupBySelectedColumns,
  removeAggregate,
  ungroupedColumns,
  type AggregatePick,
} from './model';
import { Hint, OperandSelect, RemoveButton, Section } from './parts';

const FUNCTION_LABEL: Partial<Record<AggregateFunction, string>> = {
  COUNT: 'COUNT — number of rows',
  SUM: 'SUM — total',
  AVG: 'AVG — average',
  MIN: 'MIN — smallest',
  MAX: 'MAX — largest',
  GROUP_CONCAT: 'GROUP_CONCAT — join values',
};

export function AggregatesSection({
  schema,
  hasIssue,
}: {
  schema: DatabaseSchema;
  hasIssue: boolean;
}) {
  const state = useQueryStore((s) => s.builder);
  const update = useQueryStore((s) => s.update);
  const aliasOf = new Map(state.tables.map((t) => [t.id, t.alias]));
  const ungrouped = ungroupedColumns(state);
  const grouping = state.aggregates.length > 0 || state.groupBy.length > 0;
  const groupedTables = state.tables.filter((t) => state.groupBy.some((g) => g.tableId === t.id));

  const patch = (id: string, changes: Partial<AggregatePick>) =>
    update((b) => ({
      ...b,
      aggregates: b.aggregates.map((a) => (a.id === id ? { ...a, ...changes } : a)),
    }));

  const summary = [
    state.aggregates.length > 0 &&
      `${state.aggregates.length} aggregate${state.aggregates.length === 1 ? '' : 's'}`,
    state.groupBy.length > 0 && `grouped by ${state.groupBy.length}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Section step={4} title="Summarize" summary={summary || undefined} hasIssue={hasIssue}>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">Aggregates</h3>
        {state.aggregates.map((aggregate) => {
          const label = aggregateLabel(state, aggregate);
          return (
            <div
              key={aggregate.id}
              role="group"
              aria-label={`Aggregate ${label}`}
              className="flex flex-wrap items-center gap-1.5 rounded-md bg-bg p-1.5"
            >
              <Select
                aria-label="Aggregate function"
                value={aggregate.fn}
                onChange={(e) => {
                  const fn = e.target.value as AggregateFunction;
                  patch(aggregate.id, {
                    fn,
                    distinct: aggregate.distinct && DISTINCT_AGGREGATES.includes(fn),
                  });
                }}
                className="w-44"
              >
                {AGGREGATE_FUNCTIONS.map((fn) => (
                  <option key={fn} value={fn}>
                    {FUNCTION_LABEL[fn] ?? fn}
                  </option>
                ))}
              </Select>
              <OperandSelect
                aria-label="Aggregate column"
                value={
                  aggregate.column
                    ? encodeOperand({ tableId: aggregate.tableId, column: aggregate.column })
                    : ''
                }
                onChange={(encoded) => {
                  const ref = decodeOperand(encoded);
                  patch(aggregate.id, {
                    tableId: ref?.kind === 'column' ? ref.tableId : '',
                    column: ref?.kind === 'column' ? ref.column : '',
                  });
                }}
                tables={state.tables}
                schema={schema}
                state={state}
                placeholder={aggregate.fn === 'COUNT' ? '* (all rows)' : 'Column…'}
                className="w-44"
              />
              {DISTINCT_AGGREGATES.includes(aggregate.fn) && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
                  <Checkbox
                    checked={aggregate.distinct}
                    onChange={(e) => patch(aggregate.id, { distinct: e.target.checked })}
                  />
                  Distinct
                </label>
              )}
              {aggregate.fn === 'GROUP_CONCAT' && (
                <Input
                  aria-label="Separator"
                  value={aggregate.separator}
                  onChange={(e) => patch(aggregate.id, { separator: e.target.value })}
                  placeholder="separator"
                  maxLength={16}
                  className="h-7 w-20 font-mono text-xs"
                />
              )}
              <Input
                aria-label={`Output name for ${label}`}
                value={aggregate.alias}
                onChange={(e) => patch(aggregate.id, { alias: e.target.value })}
                placeholder="Name (optional)"
                maxLength={64}
                className="h-7 min-w-28 flex-1 text-xs"
              />
              <RemoveButton
                label={`Remove ${label}`}
                onClick={() => update((b) => removeAggregate(b, aggregate.id))}
              />
            </div>
          );
        })}
        <div>
          <Button size="xs" onClick={() => update(addAggregate)}>
            <Plus /> Add aggregate
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">Group by</h3>
        {state.groupBy.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Grouping columns">
            {state.groupBy.map((g) => {
              const name = `${aliasOf.get(g.tableId)}.${g.column}`;
              return (
                <li
                  key={`${g.tableId}:${g.column}`}
                  className="flex items-center gap-0.5 rounded-md border border-border-strong bg-surface-raised py-0.5 pr-0.5 pl-2 font-mono text-xs"
                >
                  {name}
                  <RemoveButton
                    label={`Stop grouping by ${name}`}
                    onClick={() =>
                      update((b) => ({
                        ...b,
                        groupBy: b.groupBy.filter(
                          (x) => !(x.tableId === g.tableId && x.column === g.column),
                        ),
                      }))
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
        <OperandSelect
          aria-label="Add grouping column"
          value=""
          onChange={(encoded) => {
            const ref = decodeOperand(encoded);
            if (ref?.kind !== 'column') return;
            update((b) =>
              b.groupBy.some((g) => g.tableId === ref.tableId && g.column === ref.column)
                ? b
                : { ...b, groupBy: [...b.groupBy, { tableId: ref.tableId, column: ref.column }] },
            );
          }}
          tables={state.tables}
          schema={schema}
          state={state}
          placeholder="Add a grouping column…"
          className="w-56"
        />
        {ungrouped.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning-muted px-2.5 py-1.5">
            <Hint tone="warning">
              {ungrouped.length === 1
                ? 'A selected column is'
                : `${ungrouped.length} selected columns are`}{' '}
              not grouped. MySQL usually rejects that when aggregates are used.
            </Hint>
            <Button size="xs" onClick={() => update(groupBySelectedColumns)}>
              Group by selected columns
            </Button>
          </div>
        )}
      </div>

      {(grouping || countConditions(state.having) > 0) && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
            Filter groups (HAVING)
          </h3>
          <Hint>
            Applied after grouping, so it can test aggregate results such as COUNT(*) &gt; 5.
          </Hint>
          <ConditionEditor tree="having" schema={schema} tables={groupedTables} includeAggregates />
        </div>
      )}
    </Section>
  );
}
