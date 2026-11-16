import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@jarvis/shared';
import { AppError } from '../errors/app-error.js';
import type { Logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`No API route for ${req.method} ${req.path}`));
};

/**
 * Converts any thrown error into the public `ApiErrorBody` shape.
 * Stack traces and messages of unexpected errors are logged, never returned.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId = res.locals.requestId as string | undefined;

    // Body-parser errors (malformed JSON, payload too large) carry a `status` and `type`.
    if (isBodyParserError(err)) {
      const body: ApiErrorBody = {
        error: { code: 'BAD_REQUEST', message: 'Malformed request body', requestId },
      };
      res.status(err.status).json(body);
      return;
    }

    if (err instanceof AppError) {
      if (err.status >= 500)
        logger.error(err.message, { requestId, code: err.code, cause: err.cause });
      const body: ApiErrorBody = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
          requestId,
        },
      };
      res.status(err.status).json(body);
      return;
    }

    logger.error('Unhandled error', { requestId, method: req.method, path: req.path, error: err });
    const body: ApiErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId },
    };
    res.status(500).json(body);
  };
}

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number' &&
    (err as { status: number }).status < 500
  );
}
