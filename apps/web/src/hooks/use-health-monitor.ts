import { useEffect } from 'react';
import { healthMonitor } from '@/lib/health-monitor';

/** Runs the server health monitor for the lifetime of the app. Mount once, at the root. */
export function useHealthMonitor(): void {
  useEffect(() => {
    healthMonitor.start();
    return () => healthMonitor.stop();
  }, []);
}
