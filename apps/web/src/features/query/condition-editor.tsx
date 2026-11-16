import {
  CONDITION_OPERATORS,
  OPERATOR_SQL,
  QUERY_MAX_CONDITION_DEPTH,
  isComparisonOperator,
  isListOperator,
  isNullOperator,
  isRangeOperator,
  type ConditionOperator,
  type DatabaseSchema,
} from '@jarvis/shared';
import { FolderPlus, Plus, X } from 'lucide-react';
import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useQueryStore } from '@/stores/query-store';
import {
  addCondition,
  addGroup,
  decodeOperand,
  encodeOperand,
  removeNode,
  updateCondition,
  updateGroup,
  type BuilderState,
  type ConditionNode,
  type ConditionTree,
  type GroupNode,
  type TableNode,
} from './model';
import { OperandSelect, RemoveButton } from './parts';

const GROUP_OPTIONS = [
  { value: 'and', label: 'AND' },
  { value: 'or', label: 'OR' },
] as const;

const OPERATOR_HINT: Partial<Record<ConditionOperator, string>> = {
  like: '% matches any text, _ one character',
  notLike: '% matches any text, _ one character',
  regexp: 'Regular expression',
};

interface EditorContext {
  tree: ConditionTree;
  schema: DatabaseSchema;
  state: BuilderState;
  /** Tables whose columns can appear on the left of a condition. */
  tables: readonly TableNode[];
  includeAggregates: boolean;
}

/**
 * Visual editor for a WHERE or HAVING clause: a tree of AND/OR groups, each
 * holding conditions and further groups.
 */
export function ConditionEditor(props: Omit<EditorContext, 'state'>) {
  const state = useQueryStore((s) => s.builder);
  const ctx: EditorContext = { ...props, state };
  return <GroupEditor group={state[props.tree]} depth={0} ctx={ctx} />;
}

function GroupEditor({
  group,
  depth,
  ctx,
}: {
  group: GroupNode;
  depth: number;
  ctx: EditorContext;
}) {
  const update = useQueryStore((s) => s.update);
  const change = (fn: (root: GroupNode) => GroupNode) =>
    update((b) => ({ ...b, [ctx.tree]: fn(b[ctx.tree]) }));
  const nested = depth > 0;
  const label = ctx.tree === 'where' ? 'filter' : 'group filter';

  return (
    <div
      role="group"
      aria-label={
        nested ? `Nested ${group.op.toUpperCase()} group` : `${group.op.toUpperCase()} group`
      }
      className={cn(
        'flex flex-col gap-1.5',
        nested && 'rounded-md border border-border-strong bg-surface-raised/50 p-2',
      )}
    >
      {(group.items.length > 1 || nested) && (
        <div className="flex items-center gap-2">
          <span className="text-2xs text-fg-subtle">Match</span>
          <SegmentedControl
            aria-label="Combine conditions with"
            value={group.op}
            onChange={(op) => change((root) => updateGroup(root, group.id, { op }))}
            options={GROUP_OPTIONS}
          />
          <span className="text-2xs text-fg-subtle">
            {group.op === 'and'
              ? 'every condition must be true'
              : 'at least one condition must be true'}
          </span>
          {nested && (
            <span className="ml-auto">
              <RemoveButton
                label="Remove group"
                onClick={() => change((root) => removeNode(root, group.id))}
              />
            </span>
          )}
        </div>
      )}

      {group.items.map((item) =>
        item.kind === 'group' ? (
          <GroupEditor key={item.id} group={item} depth={depth + 1} ctx={ctx} />
        ) : (
          <ConditionRow key={item.id} condition={item} ctx={ctx} />
        ),
      )}

      <div className="flex gap-1.5">
        <Button size="xs" onClick={() => change((root) => addCondition(root, group.id))}>
          <Plus /> Add {label}
        </Button>
        {depth < QUERY_MAX_CONDITION_DEPTH - 1 && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => change((root) => addGroup(root, group.id))}
          >
            <FolderPlus /> Add group
          </Button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ condition, ctx }: { condition: ConditionNode; ctx: EditorContext }) {
  const update = useQueryStore((s) => s.update);
  const patch = (changes: Partial<ConditionNode>) =>
    update((b) => ({ ...b, [ctx.tree]: updateCondition(b[ctx.tree], condition.id, changes) }));
  const op = condition.operator;
  const comparesColumns = isComparisonOperator(op) && condition.rightKind === 'column';

  return (
    <div
      role="group"
      aria-label="Condition"
      className="flex flex-wrap items-center gap-1.5 rounded-md bg-bg p-1.5"
    >
      <OperandSelect
        aria-label="Condition column"
        aria-invalid={condition.left === null ? true : undefined}
        value={encodeOperand(condition.left)}
        onChange={(encoded) => patch({ left: decodeOperand(encoded) })}
        tables={ctx.tables}
        schema={ctx.schema}
        state={ctx.state}
        includeAggregates={ctx.includeAggregates}
        placeholder="Column…"
        className="w-44"
      />
      <Select
        aria-label="Condition operator"
        value={op}
        onChange={(e) => patch({ operator: e.target.value as ConditionOperator })}
        className="w-28"
      >
        {CONDITION_OPERATORS.map((operator) => (
          <option key={operator} value={operator}>
            {OPERATOR_SQL[operator]}
          </option>
        ))}
      </Select>

      <div className="flex min-w-36 flex-1 items-center gap-1.5">
        {isNullOperator(op) ? null : isListOperator(op) ? (
          <ValueList values={condition.values} onChange={(values) => patch({ values })} />
        ) : isRangeOperator(op) ? (
          <>
            <Input
              aria-label="From value"
              value={condition.value}
              onChange={(e) => patch({ value: e.target.value })}
              placeholder="from"
              className="h-7 min-w-0 flex-1 text-xs"
            />
            <span className="text-2xs text-fg-subtle">and</span>
            <Input
              aria-label="To value"
              value={condition.value2}
              onChange={(e) => patch({ value2: e.target.value })}
              placeholder="to"
              className="h-7 min-w-0 flex-1 text-xs"
            />
          </>
        ) : comparesColumns ? (
          <OperandSelect
            aria-label="Compare with column"
            value={encodeOperand(condition.rightColumn)}
            onChange={(encoded) => {
              const ref = decodeOperand(encoded);
              patch({
                rightColumn:
                  ref?.kind === 'column' ? { tableId: ref.tableId, column: ref.column } : null,
              });
            }}
            tables={ctx.state.tables}
            schema={ctx.schema}
            state={ctx.state}
            placeholder="Column…"
            className="flex-1"
          />
        ) : (
          <Input
            aria-label="Condition value"
            value={condition.value}
            onChange={(e) => patch({ value: e.target.value })}
            placeholder={OPERATOR_HINT[op] ?? 'value'}
            title={OPERATOR_HINT[op]}
            className="h-7 min-w-0 flex-1 text-xs"
          />
        )}
        {isComparisonOperator(op) && (
          <Button
            size="xs"
            variant="ghost"
            aria-pressed={comparesColumns}
            title="Compare with another column instead of a value"
            onClick={() => patch({ rightKind: comparesColumns ? 'value' : 'column' })}
            className={cn('shrink-0', comparesColumns && 'bg-accent-muted text-accent')}
          >
            Column
          </Button>
        )}
      </div>

      <RemoveButton
        label="Remove condition"
        onClick={() => update((b) => ({ ...b, [ctx.tree]: removeNode(b[ctx.tree], condition.id) }))}
      />
    </div>
  );
}

/** Tag-style input for IN lists: Enter or comma adds a value; pasting lines adds several. */
function ValueList({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const commit = (text: string) => {
    const additions = text
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter((v) => v !== '' && !values.includes(v));
    if (additions.length > 0) onChange([...values, ...additions]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (/[\n,]/.test(text)) {
      event.preventDefault();
      commit(draft + text);
    }
  };

  return (
    <div className="flex min-h-7 min-w-0 flex-1 flex-wrap items-center gap-1 rounded-md border border-border-strong bg-surface-raised px-1.5 py-0.5 shadow-raised focus-within:border-accent focus-within:ring-2 focus-within:ring-ring">
      {values.map((value) => (
        <span
          key={value}
          className="flex items-center gap-1 rounded-sm bg-surface-active py-px pr-0.5 pl-1.5 font-mono text-2xs text-fg"
        >
          {value}
          <button
            type="button"
            aria-label={`Remove value ${value}`}
            onClick={() => onChange(values.filter((v) => v !== value))}
            className="rounded-sm text-fg-subtle hover:text-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        aria-label="Add value to list"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={values.length === 0 ? 'Type a value, press Enter' : ''}
        className="h-5 min-w-24 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
