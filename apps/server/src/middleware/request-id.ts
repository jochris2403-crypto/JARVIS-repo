import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Assigns every request an id, exposed as `X-Request-Id` and `res.locals.requestId`. */
export const requestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
