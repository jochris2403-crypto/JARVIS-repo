import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Only the local user's browser — or, when deployed, browsers opening one of the
 * configured public origins — may reach the API. This guard defends against two
 * browser-based attacks:
 *
 * 1. DNS rebinding — a malicious site rebinds its hostname to 127.0.0.1. The
 *    browser then sends `Host: evil.example`, which we reject.
 * 2. Cross-site request forgery — another origin POSTs to the API. Browsers
 *    always send `Origin` on cross-origin and non-GET requests, so any request
 *    carrying an Origin outside the allow-list is rejected.
 */
export function localOnly(
  allowedOrigins: readonly string[],
  /** Origins of a deployment reachable from other machines (`JARVIS_PUBLIC_ORIGIN`). */
  publicOrigins: readonly string[] = [],
): RequestHandler {
  const origins = new Set(allowedOrigins);
  const hostnames = new Set(LOOPBACK_HOSTNAMES);
  for (const origin of publicOrigins) hostnames.add(new URL(origin).hostname.toLowerCase());
  return (req, _res, next) => {
    const hostHeader = req.headers.host ?? '';
    const hostname = hostHeader.replace(/:\d+$/, '').toLowerCase();
    // Platform health checks may address the container by an internal name. The health
    // payload is harmless (name, version, uptime), so it is exempt from the Host check.
    const healthCheck = req.method === 'GET' && req.path === '/api/health';
    if (!healthCheck && !hostnames.has(hostname)) {
      next(
        new AppError(
          'FORBIDDEN',
          publicOrigins.length > 0
            ? `JARVIS does not accept requests addressed to ${hostname || 'this host'}; add it to JARVIS_PUBLIC_ORIGIN`
            : 'JARVIS only accepts requests addressed to localhost',
        ),
      );
      return;
    }

    const origin = req.headers.origin;
    if (origin !== undefined && !origins.has(origin)) {
      next(new AppError('FORBIDDEN', 'Cross-origin request rejected'));
      return;
    }

    // Non-browser clients (curl, tests) send no Origin; browsers always do for unsafe
    // cross-origin requests, so a missing Origin on a write is still safe here.
    if (
      !SAFE_METHODS.has(req.method) &&
      origin === undefined &&
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      next(new AppError('FORBIDDEN', 'Cross-site request rejected'));
      return;
    }
    next();
  };
}
