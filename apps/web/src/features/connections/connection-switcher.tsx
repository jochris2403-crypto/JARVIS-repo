import { ChevronDown, Database, Lock, Plus, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { selectActiveProfile, useConnectionStore } from '@/stores/connection-store';

const triggerClass =
  'flex h-7 max-w-52 items-center gap-2 rounded-md border border-border px-2.5 text-xs transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-surface-hover';

/** Top-bar control showing the active connection; switches, opens and closes connections. */
export function ConnectionSwitcher() {
  const profiles = useConnectionStore((s) => s.profiles);
  const active = useConnectionStore(selectActiveProfile);
  const connect = useConnectionStore((s) => s.connect);
  const activate = useConnectionStore((s) => s.activate);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const openDialog = useConnectionStore((s) => s.openDialog);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={triggerClass}
        aria-label={active ? `Active connection: ${active.name}` : 'No connection'}
      >
        <StatusDot tone={active ? 'online' : 'idle'} />
        <span className={cn('truncate', active ? 'font-medium text-fg' : 'text-fg-muted')}>
          {active?.name ?? 'No connection'}
        </span>
        {active?.readOnly && (
          <Lock aria-label="Read-only" className="size-3 shrink-0 text-warning" />
        )}
        <ChevronDown className="size-3 shrink-0 text-fg-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {profiles.length > 0 && (
          <>
            <DropdownMenuLabel>Connections</DropdownMenuLabel>
            {profiles.map((profile) => (
              <DropdownMenuItem
                key={profile.id}
                disabled={profile.id === active?.id}
                onSelect={() =>
                  void (profile.connected ? activate(profile.id) : connect(profile.id))
                }
                className="h-auto py-1.5 data-[disabled]:opacity-100"
              >
                <StatusDot tone={profile.connected ? 'online' : 'idle'} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{profile.name}</span>
                  <span className="truncate font-mono text-2xs text-fg-subtle">
                    {profile.host}:{profile.port}
                  </span>
                </span>
                {profile.id === active?.id && (
                  <span className="ml-auto text-2xs text-accent">Active</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => openDialog({ mode: 'create' })}>
          <Plus /> New connection…
        </DropdownMenuItem>
        {active && (
          <DropdownMenuItem onSelect={() => void disconnect(active.id)}>
            <Unplug /> Disconnect from {active.name}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Database picker for the active connection, plus a schema refresh control. */
export function DatabaseSwitcher({ className }: { className?: string }) {
  const hasActive = useConnectionStore((s) => s.activeId !== null);
  const databases = useConnectionStore((s) => s.databases);
  const databasesStatus = useConnectionStore((s) => s.databasesStatus);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const schemaLoading = useConnectionStore((s) => s.schemaStatus === 'loading');
  const selectDatabase = useConnectionStore((s) => s.selectDatabase);
  const refreshSchema = useConnectionStore((s) => s.refreshSchema);

  if (!hasActive) {
    return (
      <span
        className={cn(
          'hidden h-7 items-center gap-1.5 px-1 text-xs text-fg-subtle md:flex',
          className,
        )}
      >
        <Database className="size-3.5" /> No database
      </span>
    );
  }

  const user = databases.filter((d) => !d.system);
  const system = databases.filter((d) => d.system);
  const loading = databasesStatus === 'loading';

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={triggerClass}
          aria-label={activeDatabase ? `Active database: ${activeDatabase}` : 'Select a database'}
          disabled={loading}
        >
          {loading ? (
            <Spinner className="size-3.5" label="Loading databases" />
          ) : (
            <Database className="size-3.5 shrink-0 text-fg-muted" />
          )}
          <span className={cn('truncate font-mono', activeDatabase ? 'text-fg' : 'text-fg-muted')}>
            {activeDatabase ?? (loading ? 'Loading…' : 'Select database')}
          </span>
          <ChevronDown className="size-3 shrink-0 text-fg-subtle" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 w-60 overflow-y-auto">
          {databases.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-fg-muted">
              {databasesStatus === 'error'
                ? 'Could not list databases.'
                : 'This account cannot see any databases.'}
            </p>
          ) : (
            <DropdownMenuRadioGroup
              value={activeDatabase ?? ''}
              onValueChange={(name) => void selectDatabase(name)}
            >
              {user.length > 0 && <DropdownMenuLabel>Databases</DropdownMenuLabel>}
              {user.map((db) => (
                <DropdownMenuRadioItem key={db.name} value={db.name} className="font-mono">
                  {db.name}
                </DropdownMenuRadioItem>
              ))}
              {system.length > 0 && (
                <>
                  {user.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>System</DropdownMenuLabel>
                  {system.map((db) => (
                    <DropdownMenuRadioItem
                      key={db.name}
                      value={db.name}
                      className="font-mono text-fg-muted"
                    >
                      {db.name}
                    </DropdownMenuRadioItem>
                  ))}
                </>
              )}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip content={activeDatabase ? 'Reload schema from the server' : 'Reload database list'}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh schema"
          disabled={schemaLoading || loading}
          onClick={() => void refreshSchema()}
        >
          <RefreshCw
            className={cn(schemaLoading && 'animate-[jarvis-spin_0.8s_linear_infinite]')}
          />
        </Button>
      </Tooltip>
    </div>
  );
}
