import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClientError, apiRequest } from './client';

const schema = z.object({ ok: z.boolean() });

function stubFetch(impl: () => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiRequest', () => {
  it('returns schema-validated data and prefixes the API path', async () => {
    const fetchMock = stubFetch(async () => json({ ok: true }));
    await expect(apiRequest('/thing', { schema })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]?.at(0)).toBe('/api/thing');
  });

  it('maps server error bodies to ApiClientError', async () => {
    stubFetch(async () =>
      json({ error: { code: 'NOT_FOUND', message: 'Nope', requestId: 'r1' } }, 404),
    );
    await expect(apiRequest('/thing', { schema })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'NOT_FOUND',
      status: 404,
      message: 'Nope',
      requestId: 'r1',
    });
  });

  it('rejects responses that do not match the schema', async () => {
    stubFetch(async () => json({ ok: 'yes' }));
    await expect(apiRequest('/thing', { schema })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('reports network failures', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await apiRequest('/thing', { schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('NETWORK_ERROR');
  });

  it('treats a non-JSON 502 (dev proxy with no API) as a network error', async () => {
    stubFetch(async () => new Response('Bad Gateway', { status: 502 }));
    await expect(apiRequest('/thing', { schema })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
