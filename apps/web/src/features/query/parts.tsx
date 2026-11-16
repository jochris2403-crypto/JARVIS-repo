import type { DatabaseSchema } from '@jarvis/shared';
import { ChevronRight, CircleAlert, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  aggregateLabel,
  encodeOperand,
  findTable,
  type BuilderState,
  type TableNode,
} from './model';

/** A collapsible step of the query builder. */
export function Section({
  title,
  step,
  summary,
  hasIssue,
  actions,
  children,
}: {
  title: string;
  step: number;
  /** Short status shown beside the title, e.g. "3 selected". */
  summary?: string;
  hasIssue?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const id = `query-section-${step}`;
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-border bg-surface shadow-raised"
    >
      <header className="flex h-9 items-center gap-2 pr-2 pl-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-fg-subtle transition-transform',
              open && 'rotate-90',
            )}
          />
          <span className="flex size-4.5 shrink-0 items-center justify-center rounded-sm bg-surface-active font-mono text-2xs text-fg-muted">
            {step}
          </span>
          <h2 className="text-xs font-semibold">{title}</h2>
          {summary && <span className="truncate text-2xs text-fg-subtle">{summary}</span>}
          {hasIssue && (
            <CircleAlert aria-label="Needs attention" className="size-3.5 shrink-0 text-warning" />
          )}
        </button>
        {actions}
      </header>
      {open && (
        <div id={id} className="flex flex-col gap-3 border-t border-border p-3">
          {children}
        </div>
      )}
    </section>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-danger-muted hover:text-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <X className="size-3.5" />
    </button>
  );
}

export function Hint({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'warning';
}) {
  return (
    <p className={cn('text-2xs leading-4', tone === 'warning' ? 'text-warning' : 'text-fg-subtle')}>
      {children}
    </p>
  );
}

/**
 * Picks a column (grouped by table) or, when `aggregates` is given, one of the
 * query's aggregate expressions. Values are produced by `encodeOperand`.
 */
export function OperandSelect({
  value,
  onChange,
  tables,
  schema,
  state,
  includeAggregates = false,
  placeholder,
  className,
  ...aria
}: {
  value: string;
  onChange: (encoded: string) => void;
  /** Tables whose columns may be chosen. */
  tables: readonly TableNode[];
  schema: DatabaseSchema;
  state: BuilderState;
  includeAggregates?: boolean;
  placeholder: string;
  className?: string;
  'aria-label': string;
  'aria-invalid'?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      {...aria}
    >
      <option value="">{placeholder}</option>
      {includeAggregates && state.aggregates.length > 0 && (
        <optgroup label="Aggregates">
          {state.aggregates.map((a) => (
            <option key={a.id} value={encodeOperand({ kind: 'aggregate', aggregateId: a.id })}>
              {aggregateLabel(state, a)}
            </option>
          ))}
        </optgroup>
      )}
      {tables.map((table) => (
        <optgroup key={table.id} label={table.alias}>
          {(findTable(schema, table.table)?.columns ?? []).map((column) => (
            <option
              key={column.name}
              value={encodeOperand({ tableId: table.id, column: column.name })}
            >
              {table.alias}.{column.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
