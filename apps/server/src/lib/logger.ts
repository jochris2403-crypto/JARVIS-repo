import type { LogLevel } from '../config/env.js';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Keys whose values must never reach a log sink. Matching is case-insensitive
 * and substring-based so `dbPassword`, `x-api-token` etc. are also caught.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'key',
  'credential',
];
const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

/** Deep-copies a value, replacing sensitive fields. Handles cycles and Errors. */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(inner, seen);
  }
  return out;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export type LogSink = (line: string, level: LogLevel) => void;

const defaultSink: LogSink = (line, level) => {
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
};

/**
 * Minimal structured JSON logger. All context passes through `redact` so
 * credentials cannot be logged by accident.
 */
export function createLogger(minLevel: LogLevel, sink: LogSink = defaultSink): Logger {
  const write = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...(context ? (redact(context) as Record<string, unknown>) : {}),
    };
    sink(JSON.stringify(entry), level);
  };
  return {
    debug: (m, c) => write('debug', m, c),
    info: (m, c) => write('info', m, c),
    warn: (m, c) => write('warn', m, c),
    error: (m, c) => write('error', m, c),
  };
}

/** A logger that discards everything — used in tests. */
export const silentLogger: Logger = createLogger('error', () => undefined);
