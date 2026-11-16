import { describe, expect, it } from 'vitest';
import { createLogger, redact } from './logger.js';

describe('redact', () => {
  it('redacts sensitive keys at any depth', () => {
    const out = redact({
      host: 'db.local',
      password: 'hunter2',
      nested: { dbPassword: 'x', apiToken: 'y', list: [{ secretKey: 'z', ok: 1 }] },
    });
    expect(out).toEqual({
      host: 'db.local',
      password: '[REDACTED]',
      nested: {
        dbPassword: '[REDACTED]',
        apiToken: '[REDACTED]',
        list: [{ secretKey: '[REDACTED]', ok: 1 }],
      },
    });
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(redact(a)).toEqual({ name: 'a', self: '[Circular]' });
  });
});

describe('createLogger', () => {
  it('never writes credentials and respects the minimum level', () => {
    const lines: string[] = [];
    const logger = createLogger('info', (line) => lines.push(line));
    logger.debug('hidden');
    logger.info('connecting', { user: 'app', password: 'hunter2' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('hunter2');
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 'info',
      message: 'connecting',
      user: 'app',
    });
  });
});
