import type { HealthResponse } from '@jarvis/shared';
import { create } from 'zustand';

export type ApiStatus = 'checking' | 'online' | 'offline';

interface SystemState {
  apiStatus: ApiStatus;
  health: HealthResponse | null;
  /** Round-trip time of the most recent successful health check. */
  latencyMs: number | null;
  lastCheckedAt: number | null;
  lastError: string | null;

  reportOnline: (health: HealthResponse, latencyMs: number) => void;
  reportOffline: (message: string) => void;
}

export const useSystemStore = create<SystemState>()((set) => ({
  apiStatus: 'checking',
  health: null,
  latencyMs: null,
  lastCheckedAt: null,
  lastError: null,

  reportOnline: (health, latencyMs) =>
    set({ apiStatus: 'online', health, latencyMs, lastCheckedAt: Date.now(), lastError: null }),
  reportOffline: (message) =>
    set({ apiStatus: 'offline', latencyMs: null, lastCheckedAt: Date.now(), lastError: message }),
}));
