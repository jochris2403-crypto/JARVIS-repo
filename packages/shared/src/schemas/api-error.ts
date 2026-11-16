import { z } from 'zod';

/**
 * Machine-readable error codes returned by the API. The frontend branches on
 * `code`, never on the human-readable `message`.
 */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'READ_ONLY',
  'CONFIRMATION_REQUIRED',
  'NOT_CONNECTED',
  'DB_CONNECTION_FAILED',
  'DB_QUERY_FAILED',
  'QUERY_TIMEOUT',
  'QUERY_CANCELLED',
  'INTERNAL_ERROR',
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    /** Optional structured detail, e.g. field-level validation issues. Never contains stack traces. */
    details: z.unknown().optional(),
    /** Correlates a user-visible error with server logs. */
    requestId: z.string().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
