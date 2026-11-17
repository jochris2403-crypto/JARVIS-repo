import { sessionResponseSchema, type LoginRequest, type SessionResponse } from '@jarvis/shared';
import { z } from 'zod';
import { apiRequest } from './client';

export function fetchSession(signal?: AbortSignal): Promise<SessionResponse> {
  return apiRequest('/auth/session', { schema: sessionResponseSchema, signal, timeoutMs: 8000 });
}

export function login(credentials: LoginRequest): Promise<SessionResponse> {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: credentials,
    schema: sessionResponseSchema,
  });
}

export async function logout(): Promise<void> {
  // 204 No Content: the client reads no body, which parses as `undefined`.
  await apiRequest('/auth/logout', { method: 'POST', schema: z.undefined() });
}
