import { healthResponseSchema, type HealthResponse } from '@jarvis/shared';
import { apiRequest } from './client';

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest('/health', { schema: healthResponseSchema, signal, timeoutMs: 5000 });
}
