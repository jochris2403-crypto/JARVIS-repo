import { ApiClientError } from '@/api/client';
import { fetchHealth } from '@/api/system';
import { notify } from '@/lib/notify';
import { useSystemStore, type ApiStatus } from '@/stores/system-store';

const ONLINE_INTERVAL_MS = 15_000;
const OFFLINE_INTERVAL_MS = 4_000;

/**
 * Polls `/api/health` and publishes the result to the system store. Polls more
 * often while offline so recovery is noticed quickly, and notifies the user
 * when connectivity to the JARVIS server changes.
 */
class HealthMonitor {
  private previous: ApiStatus = 'checking';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private running = false;

  start(): void {
    this.running = true;
    void this.check();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.controller?.abort();
  }

  /** Runs a health check immediately and restarts the polling interval. */
  check = async (): Promise<void> => {
    clearTimeout(this.timer);
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    const { reportOnline, reportOffline } = useSystemStore.getState();
    const started = performance.now();
    let status: ApiStatus;
    try {
      const health = await fetchHealth(controller.signal);
      if (controller.signal.aborted) return;
      reportOnline(health, Math.round(performance.now() - started));
      status = 'online';
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.code === 'ABORTED') return;
      reportOffline(error instanceof Error ? error.message : 'Unknown error');
      status = 'offline';
    }

    if (status !== this.previous) {
      if (status === 'offline') {
        notify('error', 'JARVIS server unreachable', {
          description: import.meta.env.DEV
            ? 'Start it with `npm run dev`. Retrying automatically.'
            : 'Retrying automatically.',
        });
      } else if (this.previous === 'offline') {
        notify('success', 'Reconnected to the JARVIS server');
      }
      this.previous = status;
    }

    if (this.running) {
      this.timer = setTimeout(
        () => void this.check(),
        status === 'online' ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS,
      );
    }
  };
}

export const healthMonitor = new HealthMonitor();
