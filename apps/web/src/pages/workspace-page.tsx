import { getWorkspace, type WorkspaceId } from '@jarvis/shared';
import { CircleAlert, Database, Hammer, Lock, Plus, RefreshCw, Unplug } from 'lucide-react';
import type { ReactNode } from 'react';
import { WORKSPACE_ICONS } from '@/app/workspace-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { DatabaseSwitcher } from '@/features/connections/connection-switcher';
import { SchemaSummary } from '@/features/overview/schema-summary';
import { RelationshipDesigner } from '@/features/erd/relationship-designer';
import { QueryBuilder } from '@/features/query/query-builder';
import { SystemStatusPanel } from '@/features/system/system-status-panel';
import { formatCount } from '@/lib/utils';
import { selectActiveProfile, useConnectionStore } from '@/stores/connection-store';

/** Roadmap phase (PROMPT.md §16) in which each not-yet-built workspace lands. */
const PLANNED_PHASE: Partial<Record<WorkspaceId, number>> = {
  schema: 3,
  data: 6,
  structure: 8,
  manage: 8,
};

/**
 * A workspace's frame: header plus content. Workspaces operate on a live
 * connection and database, so this resolves those prerequisites first and only
 * then renders the workspace's own content.
 */
export function WorkspacePage({ id }: { id: WorkspaceId }) {
  const workspace = getWorkspace(id);
  const Icon = WORKSPACE_ICONS[id];
  const active = useConnectionStore(selectActiveProfile);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const schema = useConnectionStore((s) => s.schema);

  // These workspaces are full-bleed and bring their own header.
  if (id === 'query' && active && schema) return <QueryBuilder schema={schema} />;
  if (id === 'relationships' && active && schema) return <RelationshipDesigner schema={schema} />;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-5 px-6 py-6">
      <header className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-raised text-accent shadow-raised">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight">{workspace.label}</h1>
            {active ? (
              <Badge tone="accent" className="font-mono">
                {active.name}
                {activeDatabase ? ` / ${activeDatabase}` : ''}
              </Badge>
            ) : (
              <Badge>No connection</Badge>
            )}
            {active?.readOnly && (
              <Badge tone="warning">
                <Lock className="size-2.5" /> Read-only
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            {workspace.description}
            {active?.serverVersion && id === 'overview' && (
              <span className="text-fg-subtle"> · MySQL {active.serverVersion}</span>
            )}
          </p>
        </div>
      </header>

      {id === 'overview' && !active && <SystemStatusPanel />}
      <WorkspaceContent id={id} label={workspace.label} />
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface/60">
      {children}
    </div>
  );
}

function WorkspaceContent({ id, label }: { id: WorkspaceId; label: string }) {
  const hasActive = useConnectionStore((s) => s.activeId !== null);
  const hasProfiles = useConnectionStore((s) => s.profiles.length > 0);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const databasesStatus = useConnectionStore((s) => s.databasesStatus);
  const databasesError = useConnectionStore((s) => s.databasesError);
  const schema = useConnectionStore((s) => s.schema);
  const schemaStatus = useConnectionStore((s) => s.schemaStatus);
  const schemaError = useConnectionStore((s) => s.schemaError);
  const refreshSchema = useConnectionStore((s) => s.refreshSchema);
  const openDialog = useConnectionStore((s) => s.openDialog);

  if (!hasActive) {
    return (
      <Frame>
        <EmptyState
          icon={Unplug}
          title="No active MySQL connection"
          description={
            hasProfiles
              ? `${label} works on a live database. Open one of your saved connections from the sidebar, or add another.`
              : `${label} works on a live database. Add a connection to a MySQL server to get started.`
          }
          actions={
            <Button variant="primary" onClick={() => openDialog({ mode: 'create' })}>
              <Plus /> New connection
            </Button>
          }
        />
      </Frame>
    );
  }

  if (databasesStatus === 'error') {
    return (
      <Frame>
        <EmptyState
          icon={CircleAlert}
          title="Could not list databases"
          description={databasesError}
          actions={
            <Button onClick={() => void refreshSchema()}>
              <RefreshCw /> Try again
            </Button>
          }
        />
      </Frame>
    );
  }

  if (!activeDatabase) {
    return (
      <Frame>
        {databasesStatus === 'ready' ? (
          <EmptyState
            icon={Database}
            title="Select a database"
            description="You are connected. Choose the database you want to work with."
            actions={<DatabaseSwitcher />}
          />
        ) : (
          <Loading label="Loading databases…" />
        )}
      </Frame>
    );
  }

  if (schemaStatus === 'error') {
    return (
      <Frame>
        <EmptyState
          icon={CircleAlert}
          title="Could not read the schema"
          description={schemaError}
          actions={
            <Button onClick={() => void refreshSchema()}>
              <RefreshCw /> Try again
            </Button>
          }
        />
      </Frame>
    );
  }

  if (!schema) {
    return (
      <Frame>
        <Loading label={`Reading schema of ${activeDatabase}…`} />
      </Frame>
    );
  }

  if (id === 'overview') return <SchemaSummary schema={schema} />;

  const phase = PLANNED_PHASE[id];
  return (
    <Frame>
      <EmptyState
        icon={Hammer}
        title={`${label} is not built yet`}
        description={
          <>
            JARVIS is connected and has read{' '}
            <span className="text-fg">{formatCount(schema.tables.length)} tables and views</span>{' '}
            from <span className="font-mono text-fg">{schema.database}</span>. This workspace
            arrives in Phase {phase} of the roadmap; the Overview shows what is available today.
          </>
        }
      />
    </Frame>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2.5 py-16 text-sm text-fg-muted">
      <Spinner label={label} /> {label}
    </div>
  );
}
