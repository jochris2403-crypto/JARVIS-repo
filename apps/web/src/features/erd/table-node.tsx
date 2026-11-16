import type { TableInfo } from '@jarvis/shared';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Eye, KeyRound, Link2, Table2 } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useErdStore } from '@/stores/erd-store';
import { nodeColumns, type DetailLevel, type Role } from './graph';
import {
  NODE_BODY_PADDING_REM,
  NODE_FOOTER_REM,
  NODE_HEADER_REM,
  NODE_ROW_REM,
  NODE_WIDTH_REM,
} from './sizes';

export type TableNodeType = Node<
  { table: TableInfo; detail: DetailLevel; junction: boolean },
  'table'
>;

const ROLE_LABEL: Record<Role, string | null> = {
  selected: null,
  parent: 'Parent',
  child: 'Child',
  both: 'Parent & child',
  connected: 'Linked',
};

const ROLE_CLASS: Record<Role, string> = {
  selected: 'border-accent ring-2 ring-ring',
  parent: 'border-success',
  child: 'border-warning',
  both: 'border-success',
  connected: 'border-fg-subtle',
};

const ROLE_BADGE: Record<Role, string> = {
  selected: '',
  parent: 'bg-success-muted text-success',
  child: 'bg-warning-muted text-warning',
  both: 'bg-success-muted text-success',
  connected: 'bg-surface-active text-fg-muted',
};

const handleClass = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent';

/** A table in the relationship diagram: name, keys, columns and types. */
export const TableNode = memo(function TableNode({ id, data }: NodeProps<TableNodeType>) {
  const role = useErdStore((s) => s.roles[id]);
  const dimmed = useErdStore((s) => s.selected.length > 0 && !(id in s.roles));
  const override = useErdStore((s) => s.expanded[id]);
  const toggleExpanded = useErdStore((s) => s.toggleExpanded);

  const { table, detail, junction } = data;
  const { columns, hidden } = nodeColumns(table, detail, override);
  const open = columns.length > 0;
  const fkColumns = new Set(table.foreignKeys.flatMap((fk) => fk.columns));
  const Icon = table.type === 'view' ? Eye : Table2;
  const label = role ? ROLE_LABEL[role] : null;

  return (
    <div
      data-table={id}
      data-role={role ?? 'none'}
      data-dimmed={dimmed}
      style={{ width: `${NODE_WIDTH_REM}rem` }}
      className={cn(
        'rounded-md border bg-surface-raised text-fg shadow-raised transition-[opacity,border-color,box-shadow] duration-150',
        role ? ROLE_CLASS[role] : 'border-border-strong',
        dimmed && 'opacity-25',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={handleClass}
      />
      <div
        style={{ height: `${NODE_HEADER_REM}rem` }}
        className={cn('flex items-center gap-1.5 pr-1 pl-2', open && 'border-b border-border')}
      >
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            role === 'selected' ? 'text-accent' : 'text-fg-subtle',
          )}
        />
        <span
          className="truncate font-mono text-xs font-medium"
          title={table.comment || table.name}
        >
          {table.name}
        </span>
        {label && (
          <span
            className={cn(
              'shrink-0 rounded-sm px-1 py-px text-2xs font-medium',
              role && ROLE_BADGE[role],
            )}
          >
            {label}
          </span>
        )}
        {junction && !label && (
          <span
            className="shrink-0 rounded-sm bg-surface-active px-1 py-px text-2xs text-fg-muted"
            title="Junction table: links two tables in a many-to-many relationship"
          >
            N:N
          </span>
        )}
        <button
          type="button"
          aria-label={open ? `Collapse ${table.name}` : `Expand ${table.name}`}
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            toggleExpanded(id, open);
          }}
          // `nodrag` lets the button be clicked without starting a drag.
          className="nodrag ml-auto flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      </div>

      {open && (
        <ul style={{ padding: `${NODE_BODY_PADDING_REM}rem 0` }}>
          {columns.map((column) => (
            <li
              key={column.name}
              style={{ height: `${NODE_ROW_REM}rem` }}
              className="flex items-center gap-1.5 px-2 text-2xs"
            >
              <span className="flex w-3 shrink-0 justify-center">
                {column.isPrimaryKey ? (
                  <KeyRound aria-label="Primary key" className="size-3 text-warning" />
                ) : fkColumns.has(column.name) ? (
                  <Link2 aria-label="Foreign key" className="size-3 text-accent" />
                ) : null}
              </span>
              <span
                className={cn(
                  'truncate font-mono',
                  column.isPrimaryKey ? 'text-fg' : 'text-fg-muted',
                )}
              >
                {column.name}
              </span>
              <span className="ml-auto max-w-[45%] shrink-0 truncate font-mono text-fg-subtle">
                {column.columnType}
              </span>
            </li>
          ))}
          {hidden > 0 && (
            <li
              style={{ height: `${NODE_FOOTER_REM}rem` }}
              className="flex items-center px-2 pl-6.5 text-2xs text-fg-subtle"
            >
              +{hidden} more column{hidden === 1 ? '' : 's'}
            </li>
          )}
        </ul>
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={handleClass}
      />
    </div>
  );
});
