import type { ConnectionProfile } from '@jarvis/shared';
import { Ellipsis, Lock, Pencil, Plug, Plus, RefreshCw, Trash2, Unplug } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';

/** Most recently used first; never-used connections follow alphabetically. */
function byRecency(a: ConnectionProfile, b: ConnectionProfile): number {
  if (a.lastConnectedAt && b.lastConnectedAt)
    return b.lastConnectedAt.localeCompare(a.lastConnectedAt);
  if (a.lastConnectedAt) return -1;
  if (b.lastConnectedAt) return 1;
  return a.name.localeCompare(b.name);
}

/** Sidebar list of saved connections with connect / edit / delete actions. */
export function ConnectionList() {
  const profiles = useConnectionStore((s) => s.profiles);
  const status = useConnectionStore((s) => s.profilesStatus);
  const error = useConnectionStore((s) => s.profilesError);
  const loadProfiles = useConnectionStore((s) => s.loadProfiles);
  const openDialog = useConnectionStore((s) => s.openDialog);
  const remove = useConnectionStore((s) => s.remove);
  const [deleting, setDeleting] = useState<ConnectionProfile | null>(null);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-fg-subtle">
        <Spinner className="size-3.5" label="Loading connections" /> Loading connections…
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-2.5">
        <p className="text-xs text-danger">Could not load connections. {error}</p>
        <Button size="xs" onClick={() => void loadProfiles()}>
          <RefreshCw /> Retry
        </Button>
      </div>
    );
  }
  if (profiles.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Plug}
        title="No connections"
        description="Add a MySQL server to start exploring."
        actions={
          <Button
            size="xs"
            variant="primary"
            className="mt-1"
            onClick={() => openDialog({ mode: 'create' })}
          >
            <Plus /> New connection
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-px px-0.5 pb-1">
        {[...profiles].sort(byRecency).map((profile) => (
          <ConnectionRow key={profile.id} profile={profile} onDelete={() => setDeleting(profile)} />
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        destructive
        title={`Delete connection “${deleting?.name}”?`}
        description={
          <>
            The saved settings and password for{' '}
            <span className="font-mono text-fg">
              {deleting?.user}@{deleting?.host}:{deleting?.port}
            </span>{' '}
            will be removed from JARVIS
            {deleting?.connected ? ' and the open session will be closed' : ''}. Nothing on the
            MySQL server is changed.
          </>
        }
        confirmLabel="Delete connection"
        onConfirm={() => (deleting ? remove(deleting.id) : undefined)}
      />
    </>
  );
}

function ConnectionRow({
  profile,
  onDelete,
}: {
  profile: ConnectionProfile;
  onDelete: () => void;
}) {
  const active = useConnectionStore((s) => s.activeId === profile.id);
  const busy = useConnectionStore((s) => s.busy[profile.id]);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const activate = useConnectionStore((s) => s.activate);
  const openDialog = useConnectionStore((s) => s.openDialog);

  const open = () => {
    if (busy) return;
    if (!profile.connected) void connect(profile.id);
    else if (!active) void activate(profile.id);
  };

  const state =
    busy === 'connecting'
      ? 'Connecting'
      : profile.connected
        ? active
          ? 'Active'
          : 'Connected'
        : 'Not connected';

  return (
    <li
      className={cn(
        'group flex items-center rounded-md transition-colors',
        active ? 'bg-surface-active' : 'hover:bg-surface-hover',
      )}
    >
      <button
        type="button"
        onClick={open}
        aria-label={`${profile.name} — ${state}`}
        aria-current={active || undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 pr-1 pl-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <StatusDot tone={busy ? 'pending' : profile.connected ? 'online' : 'idle'} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-sm', active ? 'font-medium text-fg' : 'text-fg')}>
              {profile.name}
            </span>
            {profile.readOnly && (
              <Tooltip content="Read-only connection">
                <Lock aria-label="Read-only" className="size-3 shrink-0 text-warning" />
              </Tooltip>
            )}
          </span>
          <span className="truncate font-mono text-2xs text-fg-subtle">
            {profile.user}@{profile.host}:{profile.port}
          </span>
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${profile.name}`}
            className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {profile.connected ? (
            <DropdownMenuItem disabled={!!busy} onSelect={() => void disconnect(profile.id)}>
              <Unplug /> Disconnect
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={!!busy} onSelect={() => void connect(profile.id)}>
              <Plug /> Connect
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => openDialog({ mode: 'edit', id: profile.id })}>
            <Pencil /> Edit…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={onDelete}>
            <Trash2 /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
