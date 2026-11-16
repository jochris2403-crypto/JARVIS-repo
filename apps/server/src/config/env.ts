import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JARVIS_HOST: z.string().min(1).default('127.0.0.1'),
  JARVIS_PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  JARVIS_WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  JARVIS_DATA_DIR: z.string().min(1).optional(),
  JARVIS_SECRET_KEY: z.string().min(1).optional(),
  JARVIS_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
  JARVIS_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

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
  const webOrigin = new URL(env.JARVIS_WEB_ORIGIN).origin;
  const origins = [
    ...loopbackVariants(webOrigin),
    ...loopbackVariants(`http://${env.JARVIS_HOST}:${env.JARVIS_PORT}`),
  ];

  return {
    env: env.NODE_ENV,
    host: env.JARVIS_HOST,
    port: env.JARVIS_PORT,
    allowedOrigins: [...new Set(origins)],
    dataDir: path.resolve(env.JARVIS_DATA_DIR ?? path.join(os.homedir(), '.jarvis')),
    secretKey: env.JARVIS_SECRET_KEY,
    queryTimeoutMs: env.JARVIS_QUERY_TIMEOUT_MS,
    logLevel: env.JARVIS_LOG_LEVEL,
  };
}
