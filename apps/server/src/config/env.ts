import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JARVIS_HOST: z.string().min(1).default('127.0.0.1'),
  JARVIS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  /** Hosting platforms (Railway, Fly, Heroku…) inject the port to listen on as PORT. */
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  JARVIS_WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  JARVIS_DATA_DIR: z.string().min(1).optional(),
  JARVIS_SECRET_KEY: z.string().min(1).optional(),
  JARVIS_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
  JARVIS_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  /** Comma-separated URL(s) people use to open JARVIS from other machines. */
  JARVIS_PUBLIC_ORIGIN: z.string().optional(),
  // Public URLs injected by hosting platforms; added to the public origins automatically.
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  FLY_APP_NAME: z.string().optional(),
  JARVIS_AUTH_USERNAME: z.string().min(1).default('admin'),
  /** Enables the login screen. Required whenever JARVIS listens on a non-loopback interface. */
  JARVIS_AUTH_PASSWORD: z.string().optional(),
  JARVIS_SESSION_TTL_HOURS: z.coerce
    .number()
    .min(0.1)
    .max(24 * 30)
    .default(12),
  /** Number of reverse proxies in front of JARVIS (1 on Railway/Fly), or 0/false. */
  JARVIS_TRUST_PROXY: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '' || value === 'false') return 0;
      if (value === 'true') return 1;
      const hops = Number(value);
      if (!Number.isInteger(hops) || hops < 0) {
        ctx.addIssue({ code: 'custom', message: 'must be a number of proxy hops, true or false' });
        return z.NEVER;
      }
      return hops;
    }),
});

export interface AuthConfig {
  username: string;
  password: string;
  sessionTtlMs: number;
}

export interface ServerConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  /** Origins permitted to make browser requests to the API. */
  allowedOrigins: string[];
  dataDir: string;
  /** Optional key for encrypting stored passwords; a key file is used when unset. */
  secretKey?: string;
  /** Time limit for queries run from the query builder. */
  queryTimeoutMs: number;
  logLevel: LogLevel;
  /** Origins (scheme://host:port) JARVIS is reached at from other machines. */
  publicOrigins: string[];
  /** Present when a password is configured; the API then requires a login. */
  auth?: AuthConfig;
  /** Value for Express's `trust proxy` setting (hops). 0 disables it. */
  trustProxy: number;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

/** `localhost` and `127.0.0.1` are the same machine; accept whichever the user typed. */
function loopbackVariants(origin: string): string[] {
  const url = new URL(origin);
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return [url.origin];
  return ['localhost', '127.0.0.1'].map((host) => {
    const copy = new URL(url.origin);
    copy.hostname = host;
    return copy.origin;
  });
}

/**
 * Parses process environment into a validated configuration object.
 * Throws a readable error listing every invalid variable.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid JARVIS configuration:\n${problems}`);
  }
  const env = parsed.data;
  const port = env.JARVIS_PORT ?? env.PORT ?? 4310;

  const problems: string[] = [];
  const publicOrigins: string[] = [];
  const platformOrigins = [
    env.RAILWAY_PUBLIC_DOMAIN && `https://${env.RAILWAY_PUBLIC_DOMAIN}`,
    env.FLY_APP_NAME && `https://${env.FLY_APP_NAME}.fly.dev`,
  ].filter((origin): origin is string => Boolean(origin));
  for (const raw of [...(env.JARVIS_PUBLIC_ORIGIN ?? '').split(','), ...platformOrigins]) {
    const value = raw.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      if (!publicOrigins.includes(url.origin)) publicOrigins.push(url.origin);
    } catch {
      problems.push(`  - JARVIS_PUBLIC_ORIGIN: "${value}" is not an http(s) URL`);
    }
  }

  const password = env.JARVIS_AUTH_PASSWORD ? env.JARVIS_AUTH_PASSWORD : undefined;
  if (password !== undefined && password.length < 8) {
    problems.push('  - JARVIS_AUTH_PASSWORD: must be at least 8 characters');
  }
  // Without a login, anyone who can reach the port could read saved connections and
  // query those databases. Refuse to start rather than expose it by accident.
  if (!password && (!isLoopbackHost(env.JARVIS_HOST) || publicOrigins.length > 0)) {
    problems.push(
      '  - JARVIS_AUTH_PASSWORD: required when JARVIS_HOST is not loopback or JARVIS_PUBLIC_ORIGIN is set',
    );
  }
  if (problems.length > 0) {
    throw new Error(`Invalid JARVIS configuration:\n${problems.join('\n')}`);
  }

  const webOrigin = new URL(env.JARVIS_WEB_ORIGIN).origin;
  const origins = [
    ...loopbackVariants(webOrigin),
    ...loopbackVariants(`http://${env.JARVIS_HOST}:${port}`),
    ...publicOrigins,
  ];

  return {
    env: env.NODE_ENV,
    host: env.JARVIS_HOST,
    port,
    allowedOrigins: [...new Set(origins)],
    dataDir: path.resolve(env.JARVIS_DATA_DIR ?? path.join(os.homedir(), '.jarvis')),
    secretKey: env.JARVIS_SECRET_KEY,
    queryTimeoutMs: env.JARVIS_QUERY_TIMEOUT_MS,
    logLevel: env.JARVIS_LOG_LEVEL,
    publicOrigins,
    auth: password
      ? {
          username: env.JARVIS_AUTH_USERNAME,
          password,
          sessionTtlMs: Math.round(env.JARVIS_SESSION_TTL_HOURS * 3_600_000),
        }
      : undefined,
    trustProxy: env.JARVIS_TRUST_PROXY,
  };
}
