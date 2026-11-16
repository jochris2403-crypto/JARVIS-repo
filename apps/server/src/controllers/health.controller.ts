import type { RequestHandler } from 'express';
import { APP_NAME, type HealthResponse } from '@jarvis/shared';

export interface HealthControllerDeps {
  version: string;
  startedAt: number;
  now?: () => number;
}

export function createHealthController({
  version,
  startedAt,
  now = Date.now,
}: HealthControllerDeps): RequestHandler {
  return (_req, res) => {
    const current = now();
    const body: HealthResponse = {
      status: 'ok',
      name: APP_NAME,
      version,
      uptimeSeconds: Math.max(0, Math.round((current - startedAt) / 1000)),
      nodeVersion: process.version,
      serverTime: new Date(current).toISOString(),
    };
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
  };
}
