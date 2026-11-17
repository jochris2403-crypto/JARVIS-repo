import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthConfig } from '../config/env.js';

export const SESSION_COOKIE = 'jarvis_session';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

/** Reads one cookie from the request without pulling in a cookie-parser dependency. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * Single-account authentication with stateless, HMAC-signed session cookies.
 *
 * The signing key is derived from the server's encryption key *and* the
 * configured credentials, so changing the password (or the key) signs everyone
 * out. Sessions survive a server restart because nothing is held in memory.
 */
export class SessionAuth {
  readonly username: string;
  private readonly expectedUser: Buffer;
  private readonly expectedPassword: Buffer;
  private readonly signingKey: Buffer;
  private readonly ttlMs: number;
  private readonly httpsHosts: Set<string>;

  constructor(
    config: AuthConfig,
    masterKey: Buffer,
    publicOrigins: readonly string[] = [],
    private readonly now: () => number = Date.now,
  ) {
    this.username = config.username;
    this.expectedUser = sha256(config.username);
    this.expectedPassword = sha256(config.password);
    this.ttlMs = config.sessionTtlMs;
    this.signingKey = createHmac('sha256', masterKey)
      .update(`jarvis-session\0${config.username}\0${config.password}`)
      .digest();
    this.httpsHosts = new Set(
      publicOrigins
        .map((origin) => new URL(origin))
        .filter((url) => url.protocol === 'https:')
        .map((url) => url.hostname.toLowerCase()),
    );
  }

  /** Constant-time comparison of both fields; always evaluates both. */
  checkCredentials(username: string, password: string): boolean {
    const userOk = timingSafeEqual(sha256(username), this.expectedUser);
    const passwordOk = timingSafeEqual(sha256(password), this.expectedPassword);
    return userOk && passwordOk;
  }

  issueToken(): string {
    const payload = base64url(JSON.stringify({ u: this.username, exp: this.now() + this.ttlMs }));
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns the username for a valid, unexpired token, otherwise null. */
  verifyToken(token: string | undefined): string | null {
    if (!token) return null;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        u?: unknown;
        exp?: unknown;
      };
      if (data.u !== this.username || typeof data.exp !== 'number') return null;
      if (data.exp <= this.now()) return null;
      return data.u;
    } catch {
      return null;
    }
  }

  sessionUser(req: Request): string | null {
    return this.verifyToken(readCookie(req, SESSION_COOKIE));
  }

  setSessionCookie(req: Request, res: Response): void {
    res.cookie(SESSION_COOKIE, this.issueToken(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.isSecure(req),
      path: '/',
      maxAge: this.ttlMs,
    });
  }

  clearSessionCookie(req: Request, res: Response): void {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.isSecure(req),
      path: '/',
    });
  }

  /**
   * A `Secure` cookie is silently dropped on plain http (e.g. http://192.168.1.20:4310),
   * so it is only set when the page is actually served over https — either seen
   * directly or because the request is addressed to an https public origin
   * (TLS usually terminates at the hosting platform's proxy).
   */
  private isSecure(req: Request): boolean {
    if (req.secure) return true;
    const hostname = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    return this.httpsHosts.has(hostname);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.signingKey).update(payload).digest('base64url');
  }
}

/** Counts failed logins per client address within a fixed window. */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Milliseconds until the client may try again, or 0 when it is allowed now. */
  retryAfterMs(key: string): number {
    const entry = this.failures.get(key);
    if (!entry) return 0;
    const remaining = entry.resetAt - this.now();
    if (remaining <= 0) {
      this.failures.delete(key);
      return 0;
    }
    return entry.count >= this.maxFailures ? remaining : 0;
  }

  recordFailure(key: string): void {
    const current = this.now();
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt <= current) {
      this.failures.set(key, { count: 1, resetAt: current + this.windowMs });
    } else {
      entry.count += 1;
    }
    if (this.failures.size > 10_000) this.prune(current);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private prune(current: number): void {
    for (const [key, entry] of this.failures) {
      if (entry.resetAt <= current) this.failures.delete(key);
    }
  }
}
