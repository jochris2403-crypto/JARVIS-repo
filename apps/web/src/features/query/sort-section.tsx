import { QUERY_MAX_LIMIT, type DatabaseSchema } from '@jarvis/shared';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useQueryStore } from '@/stores/query-store';
import { decodeOperand, encodeOperand, move, newId, type SortPick } from './model';
import { Hint, OperandSelect, RemoveButton, Section } from './parts';

export function SortSection({ schema, hasIssue }: { schema: DatabaseSchema; hasIssue: boolean }) {
  const state = useQueryStore((s) => s.builder);
  const update = useQueryStore((s) => s.update);

  const patch = (id: string, changes: Partial<SortPick>) =>
    update((b) => ({
      ...b,
      orderBy: b.orderBy.map((o) => (o.id === id ? { ...o, ...changes } : o)),
    }));

  return (
    <Section
      step={5}
      title="Sort and limit"
      summary={`${state.orderBy.length > 0 ? `${state.orderBy.length} sort key${state.orderBy.length === 1 ? '' : 's'} · ` : ''}limit ${state.limit || '?'}`}
      hasIssue={hasIssue}
    >
      <div className="flex flex-col gap-1.5">
        {state.orderBy.map((sort, index) => (
          <div
            key={sort.id}
            role="group"
            aria-label={`Sort key ${index + 1}`}
            className="flex items-center gap-1.5 rounded-md bg-bg p-1.5"
          >
            <span className="w-10 shrink-0 text-right text-2xs text-fg-subtle">
              {index === 0 ? 'Sort by' : 'then'}
            </span>
            <OperandSelect
              aria-label="Sort column"
              aria-invalid={sort.target === null ? true : undefined}
              value={encodeOperand(sort.target)}
              onChange={(encoded) => patch(sort.id, { target: decodeOperand(encoded) })}
              tables={state.tables}
              schema={schema}
              state={state}
              includeAggregates
              placeholder="Column…"
              className="flex-1"
            />
            <Select
              aria-label="Sort direction"
              value={sort.direction}
              onChange={(e) => patch(sort.id, { direction: e.target.value as 'asc' | 'desc' })}
              className="w-32"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Move sort key up"
              disabled={index === 0}
              onClick={() => update((b) => ({ ...b, orderBy: move(b.orderBy, index, -1) }))}
            >
              <ArrowUp />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Move sort key down"
              disabled={index === state.orderBy.length - 1}
              onClick={() => update((b) => ({ ...b, orderBy: move(b.orderBy, index, 1) }))}
            >
              <ArrowDown />
            </Button>
            <RemoveButton
              label="Remove sort key"
              onClick={() =>
                update((b) => ({ ...b, orderBy: b.orderBy.filter((o) => o.id !== sort.id) }))
              }
            />
          </div>
        ))}
        <div>
          <Button
            size="xs"
            onClick={() =>
              update((b) => ({
                ...b,
                orderBy: [...b.orderBy, { id: newId('o'), target: null, direction: 'asc' }],
              }))
            }
          >
            <Plus /> Add sort
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Limit" htmlFor="query-limit" hint={`Rows per run, up to ${QUERY_MAX_LIMIT}.`}>
          <Input
            id="query-limit"
            inputMode="numeric"
            value={state.limit}
            onChange={(e) => update((b) => ({ ...b, limit: e.target.value }))}
            className="h-7 font-mono text-xs"
          />
        </Field>
        <Field label="Offset" htmlFor="query-offset" hint="Rows to skip first.">
          <Input
            id="query-offset"
            inputMode="numeric"
            value={state.offset}
            onChange={(e) => update((b) => ({ ...b, offset: e.target.value }))}
            className="h-7 font-mono text-xs"
          />
        </Field>
      </div>
      {state.orderBy.length === 0 && (
        <Hint>Without a sort, MySQL may return rows in any order, so pages can overlap.</Hint>
      )}
    </Section>
  );
}
