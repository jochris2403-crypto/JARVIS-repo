import { RefreshCw } from 'lucide-react';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { healthMonitor } from '@/lib/health-monitor';
import { useSystemStore, type ApiStatus } from '@/stores/system-store';

const STATUS: Record<ApiStatus, { tone: StatusTone; label: string }> = {
  checking: { tone: 'pending', label: 'Contacting server…' },
  online: { tone: 'online', label: 'Server online' },
  offline: { tone: 'offline', label: 'Server offline' },
};

/** Bottom bar: live state of the link between the browser and the JARVIS server. */
export function StatusBar() {
  const apiStatus = useSystemStore((s) => s.apiStatus);
  const latencyMs = useSystemStore((s) => s.latencyMs);
  const version = useSystemStore((s) => s.health?.version);
  const lastError = useSystemStore((s) => s.lastError);
  const { tone, label } = STATUS[apiStatus];

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-surface px-2 text-2xs text-fg-subtle">
      <Tooltip
        content={
          apiStatus === 'offline' && lastError
            ? `${lastError} — click to retry`
            : 'Check server now'
        }
        side="top"
      >
        <button
          type="button"
          onClick={() => void healthMonitor.check()}
          className="group flex h-full items-center gap-1.5 rounded-sm px-1 transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StatusDot tone={tone} />
          <span role="status">{label}</span>
          <RefreshCw className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
      </Tooltip>
      {apiStatus === 'online' && latencyMs !== null && (
        <span className="font-mono tabular-nums">{latencyMs} ms</span>
      )}
      <span className="ml-auto font-mono">{version ? `v${version}` : ''}</span>
    </footer>
  );
}
