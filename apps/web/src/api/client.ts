import { API_PREFIX, apiErrorBodySchema, type ApiErrorCode } from '@jarvis/shared';
import type { z } from 'zod';

/** Client-side error codes in addition to the server's `ApiErrorCode`s. */
export type ClientErrorCode =
  ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'ABORTED' | 'INVALID_RESPONSE';

export class ApiClientError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number | null;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    code: ClientErrorCode,
    message: string,
    options: { status?: number | null; details?: unknown; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = options.status ?? null;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

export interface RequestOptions<TSchema extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Zod schema the response body must satisfy. Responses are never trusted blindly. */
  schema: TSchema;
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Typed fetch wrapper for the JARVIS API.
 * - Validates successful responses against a Zod schema.
 * - Normalises every failure into an `ApiClientError`.
 */
export async function apiRequest<TSchema extends z.ZodType>(
  path: string,
  { method = 'GET', body, schema, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: combined,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (timeoutSignal.aborted)
      throw new ApiClientError('TIMEOUT', 'The JARVIS server did not respond in time');
    if (signal?.aborted) throw new ApiClientError('ABORTED', 'Request cancelled');
    throw new ApiClientError('NETWORK_ERROR', 'Cannot reach the JARVIS server', {
      details: String(error),
    });
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details, requestId } = parsed.data.error;
      throw new ApiClientError(code, message, { status: response.status, details, requestId });
    }
    // A non-JSON error usually means the dev proxy could not reach the API.
    const code: ClientErrorCode =
      response.status >= 502 && response.status <= 504 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR';
    throw new ApiClientError(code, `Request failed with status ${response.status}`, {
      status: response.status,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError('INVALID_RESPONSE', 'The server returned an unexpected response', {
      status: response.status,
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}
