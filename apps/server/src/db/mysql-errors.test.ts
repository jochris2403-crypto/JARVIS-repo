import { describe, expect, it } from 'vitest';
import { toConnectionError, toQueryError } from './mysql-errors.js';

const target = { host: 'db.internal', port: 3306 };

describe('toConnectionError', () => {
  it.each([
    ['ECONNREFUSED', /Connection refused at db\.internal:3306/],
    ['ENOTFOUND', /could not be resolved/],
    ['ETIMEDOUT', /Timed out/],
    ['ER_ACCESS_DENIED_ERROR', /Access denied/],
    ['ER_BAD_DB_ERROR', /does not exist/],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', /certificate could not be verified/],
  ])('explains %s', (code, pattern) => {
    const error = toConnectionError({ code }, target);
    expect(error.code).toBe('DB_CONNECTION_FAILED');
    expect(error.message).toMatch(pattern);
    expect(error.details).toMatchObject({ mysqlCode: code });
  });

  it('falls back to a generic message for unknown failures', () => {
    expect(toConnectionError(new Error('boom'), target).message).toBe(
      'Could not connect to db.internal:3306.',
    );
  });
});

describe('toQueryError', () => {
  it('reports a dropped connection as a connection failure', () => {
    expect(toQueryError({ code: 'PROTOCOL_CONNECTION_LOST' }).code).toBe('DB_CONNECTION_FAILED');
  });
  it('passes MySQL’s message through for statement errors', () => {
    const error = toQueryError({
      code: 'ER_NO_SUCH_TABLE',
      sqlMessage: "Table 'x.y' doesn't exist",
    });
    expect(error.code).toBe('DB_QUERY_FAILED');
    expect(error.message).toBe("Table 'x.y' doesn't exist");
  });
});
