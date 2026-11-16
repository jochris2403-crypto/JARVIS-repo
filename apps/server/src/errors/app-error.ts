import type { ApiErrorCode } from '@jarvis/shared';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  READ_ONLY: 403,
  CONFIRMATION_REQUIRED: 428,
  NOT_CONNECTED: 409,
  DB_CONNECTION_FAILED: 502,
  DB_QUERY_FAILED: 400,
  QUERY_TIMEOUT: 504,
  QUERY_CANCELLED: 409,
  INTERNAL_ERROR: 500,
};

/**
 * An error that is safe to show to the user. Anything thrown that is *not*
 * an AppError is treated as an internal error and its message is hidden.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { details?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options?.details;
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static validation(details: unknown, message = 'Request validation failed'): AppError {
    return new AppError('VALIDATION_FAILED', message, { details });
  }
}
