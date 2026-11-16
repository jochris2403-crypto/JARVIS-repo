import type { TableInfo } from '@jarvis/shared';
import { Database, Eye, Plus, RefreshCw, Table2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { workspacePath } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { addTable } from '@/features/query/model';
import { useConnectionStore } from '@/stores/connection-store';
import { useQueryStore } from '@/stores/query-store';

/**
 * Sidebar listing of the active database's tables and views.
 * The full hierarchical explorer (columns, indexes, search, context actions)
 * is Phase 3; this shows what schema introspection found.
 */
export function ExplorerList() {
  const hasActive = useConnectionStore((s) => s.activeId !== null);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const schema = useConnectionStore((s) => s.schema);
  const status = useConnectionStore((s) => s.schemaStatus);
  const error = useConnectionStore((s) => s.schemaError);
  const refreshSchema = useConnectionStore((s) => s.refreshSchema);

  if (!hasActive) {
    return (
      <EmptyState
        size="sm"
        icon={Database}
        title="No database selected"
        description="Connect to a server to browse its tables, views and routines."
      />
    );
  }
  if (!activeDatabase) {
    return (
      <EmptyState
        size="sm"
        icon={Database}
        title="Select a database"
        description="Choose one from the database menu in the top bar."
      />
    );
  }
  if (status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-2.5">
        <p className="text-xs text-danger">Could not read the schema. {error}</p>
        <Button size="xs" onClick={() => void refreshSchema()}>
          <RefreshCw /> Retry
        </Button>
      </div>
    );
  }
  if (!schema) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-fg-subtle">
        <Spinner className="size-3.5" label="Reading schema" /> Reading schema…
      </div>
    );
  }
  if (schema.tables.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Table2}
        title="Empty database"
        description={`${schema.database} has no tables or views.`}
      />
    );
  }

  const tables = schema.tables.filter((t) => t.type === 'table');
  const views = schema.tables.filter((t) => t.type === 'view');
  return (
    <div className="flex flex-col gap-2 pb-1.5">
      <ObjectGroup label="Tables" items={tables} />
      <ObjectGroup label="Views" items={views} />
    </div>
  );
}

function ObjectGroup({ label, items }: { label: string; items: TableInfo[] }) {
  const navigate = useNavigate();
  if (items.length === 0) return null;

  /** Adds the table to the query being built and opens the Query Builder. */
  const addToQuery = (name: string) => {
    const { activeId, schema } = useConnectionStore.getState();
    if (!schema) return;
    const query = useQueryStore.getState();
    query.ensureContext(`${activeId}:${schema.database}`);
    query.update((builder) => addTable(builder, schema, name));
    void navigate(workspacePath('query'));
  };

  return (
    <div>
      <h3 className="flex items-center justify-between px-3 py-1 text-2xs text-fg-subtle">
        {label}
        <span className="font-mono tabular-nums">{items.length}</span>
      </h3>
      <ul aria-label={label}>
        {items.map((item) => {
          const Icon = item.type === 'view' ? Eye : Table2;
          return (
            <li
              key={item.name}
              className="group flex h-6 items-center gap-2 pr-1.5 pl-3 text-xs hover:bg-surface-hover"
              title={item.comment || undefined}
            >
              <Icon className="size-3.5 shrink-0 text-fg-subtle" />
              <span className="truncate font-mono text-fg">{item.name}</span>
              <span className="ml-auto shrink-0 font-mono text-2xs text-fg-subtle tabular-nums group-focus-within:hidden group-hover:hidden">
                {item.columns.length}
              </span>
              <button
                type="button"
                aria-label={`Add ${item.name} to query`}
                title="Add to query"
                onClick={() => addToQuery(item.name)}
                className="ml-auto hidden size-5 shrink-0 items-center justify-center rounded-sm text-fg-muted group-focus-within:flex group-hover:flex hover:bg-accent-muted hover:text-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Plus className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
