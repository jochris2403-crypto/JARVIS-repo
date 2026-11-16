import { describe, expect, it } from 'vitest';
import { initialValues, parseForm } from './connection-form';

const valid = { ...initialValues(), name: 'Local', user: 'root', password: 'pw' };

describe('parseForm', () => {
  it('builds an API payload from valid values', () => {
    const result = parseForm({ ...valid, database: ' shop ', timeoutSeconds: '2.5' }, false);
    expect(result).toEqual({
      ok: true,
      input: {
        name: 'Local',
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: 'pw',
        database: 'shop',
        ssl: { enabled: false, rejectUnauthorized: true },
        connectTimeoutMs: 2500,
        readOnly: false,
      },
    });
  });

  it('omits the password when the stored one is kept, and blank optional fields', () => {
    const result = parseForm(valid, true);
    expect(result.ok && result.input).not.toHaveProperty('password');
    expect(result.ok && result.input).not.toHaveProperty('database');
  });

  it('only sends a CA certificate when SSL is on', () => {
    const off = parseForm({ ...valid, sslCa: 'PEM' }, false);
    expect(off.ok && off.input.ssl).toEqual({ enabled: false, rejectUnauthorized: true });
    const on = parseForm({ ...valid, sslEnabled: true, sslVerify: false, sslCa: ' PEM ' }, false);
    expect(on.ok && on.input.ssl).toEqual({ enabled: true, rejectUnauthorized: false, ca: 'PEM' });
  });

  it('maps schema failures to form fields with readable messages', () => {
    const result = parseForm({ ...valid, name: ' ', port: 'abc', timeoutSeconds: '0' }, false);
    expect(result).toEqual({
      ok: false,
      errors: {
        name: 'Enter a name for this connection.',
        port: 'Enter a port between 1 and 65535.',
        timeoutSeconds: 'Enter a timeout between 1 and 120 seconds.',
      },
    });
  });
});
