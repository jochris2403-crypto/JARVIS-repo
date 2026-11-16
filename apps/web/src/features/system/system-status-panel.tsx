import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { healthMonitor } from '@/lib/health-monitor';
import { cn, formatDuration } from '@/lib/utils';
import { useSystemStore } from '@/stores/system-store';

/** Live facts about the JARVIS API process, straight from `GET /api/health`. */
export function SystemStatusPanel({ className }: { className?: string }) {
  const apiStatus = useSystemStore((s) => s.apiStatus);
  const health = useSystemStore((s) => s.health);
  const latencyMs = useSystemStore((s) => s.latencyMs);
  const lastCheckedAt = useSystemStore((s) => s.lastCheckedAt);
  const lastError = useSystemStore((s) => s.lastError);
  const online = apiStatus === 'online';

  return (
    <section
      aria-label="JARVIS server"
      className={cn('rounded-lg border border-border bg-surface shadow-raised', className)}
    >
      <header className="flex h-10 items-center justify-between border-b border-border pr-2 pl-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-semibold">JARVIS server</h2>
          {apiStatus === 'checking' && <Badge tone="warning">Checking</Badge>}
          {apiStatus === 'online' && <Badge tone="success">Online</Badge>}
          {apiStatus === 'offline' && <Badge tone="danger">Offline</Badge>}
        </div>
        <Button variant="ghost" size="xs" onClick={() => void healthMonitor.check()}>
          <RefreshCw /> Check now
        </Button>
      </header>

      {apiStatus === 'offline' ? (
        <div className="px-4 py-3.5 text-xs leading-relaxed text-fg-muted">
          <p className="text-fg">The web app cannot reach the JARVIS API.</p>
          <p className="mt-1">
            Start it with{' '}
            <code className="rounded-sm bg-surface-active px-1 py-px font-mono text-2xs">
              npm run dev
            </code>{' '}
            from the project root. JARVIS retries automatically.
          </p>
          {lastError && <p className="mt-1 font-mono text-2xs text-fg-subtle">{lastError}</p>}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg bg-border sm:grid-cols-4">
          <Fact label="Version" value={health ? `v${health.version}` : null} />
          <Fact
            label="Runtime"
            value={health ? `Node ${health.nodeVersion.replace(/^v/, '')}` : null}
          />
          <Fact label="Uptime" value={health ? formatDuration(health.uptimeSeconds) : null} />
          <Fact
            label="Round trip"
            value={online && latencyMs !== null ? `${latencyMs} ms` : null}
          />
        </dl>
      )}
      {lastCheckedAt !== null && (
        <p className="sr-only" role="status">
          Last checked {new Date(lastCheckedAt).toLocaleTimeString()}
        </p>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode | null }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-2xs tracking-wide text-fg-subtle uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-fg tabular-nums">
        {value ?? (
          <span className="inline-block h-3.5 w-14 animate-pulse rounded-sm bg-surface-active align-middle" />
        )}
      </dd>
    </div>
  );
}
