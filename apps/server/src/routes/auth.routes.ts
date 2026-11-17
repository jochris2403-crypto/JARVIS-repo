import { Router, type RequestHandler } from 'express';
import { loginRequestSchema, type SessionResponse } from '@jarvis/shared';
import { AppError } from '../errors/app-error.js';
import { parseInput } from '../middleware/validate.js';
import type { LoginThrottle, SessionAuth } from '../security/session-auth.js';

/**
 * `/api/auth/*`. Always mounted so the web app can ask whether a login is
 * needed; with authentication disabled every caller is reported as signed in.
 */
export function createAuthRouter(auth: SessionAuth | undefined, throttle: LoginThrottle): Router {
  const router = Router();

  router.get('/session', (req, res) => {
    const body: SessionResponse = auth
      ? (() => {
          const user = auth.sessionUser(req);
          return { authRequired: true, authenticated: user !== null, username: user };
        })()
      : { authRequired: false, authenticated: true, username: null };
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
  });

  router.post('/login', (req, res) => {
    if (!auth) {
      const body: SessionResponse = { authRequired: false, authenticated: true, username: null };
      res.json(body);
      return;
    }
    const client = req.ip ?? 'unknown';
    const waitMs = throttle.retryAfterMs(client);
    if (waitMs > 0) {
      res.setHeader('Retry-After', String(Math.ceil(waitMs / 1000)));
      throw new AppError(
        'TOO_MANY_REQUESTS',
        `Too many failed sign-in attempts. Try again in ${Math.ceil(waitMs / 60_000)} minute(s).`,
      );
    }
    const { username, password } = parseInput(loginRequestSchema, req.body);
    if (!auth.checkCredentials(username, password)) {
      throttle.recordFailure(client);
      throw new AppError('UNAUTHORIZED', 'Incorrect username or password');
    }
    throttle.reset(client);
    auth.setSessionCookie(req, res);
    const body: SessionResponse = { authRequired: true, authenticated: true, username };
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
  });

  router.post('/logout', (req, res) => {
    auth?.clearSessionCookie(req, res);
    res.status(204).end();
  });

  return router;
}

/** Rejects API requests without a valid session. A no-op when authentication is disabled. */
export function requireSession(auth: SessionAuth | undefined): RequestHandler {
  return (req, _res, next) => {
    if (!auth || auth.sessionUser(req) !== null) {
      next();
      return;
    }
    next(new AppError('UNAUTHORIZED', 'Sign in to continue'));
  };
}
