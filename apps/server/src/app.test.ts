import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { apiErrorBodySchema, healthResponseSchema } from '@jarvis/shared';
import { createTestApp } from './test/test-app.js';

const WEB_ORIGIN = 'http://localhost:5173';

function makeApp() {
  return createTestApp({
    version: '9.9.9',
    startedAt: Date.now() - 5000,
    allowedOrigins: [WEB_ORIGIN],
  }).app;
}

describe('GET /api/health', () => {
  it('returns a schema-valid health payload', async () => {
    const res = await request(makeApp()).get('/api/health').expect(200);
    const body = healthResponseSchema.parse(res.body);
    expect(body.version).toBe('9.9.9');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(4);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('error handling', () => {
  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await request(makeApp()).get('/api/does-not-exist').expect(404);
    const body = apiErrorBodySchema.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeDefined();
  });

  it('rejects malformed JSON without leaking parser internals', async () => {
    const res = await request(makeApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });
});

describe('local-only guard', () => {
  it('rejects requests addressed to a non-loopback host (DNS rebinding)', async () => {
    const res = await request(makeApp()).get('/api/health').set('Host', 'evil.example:4310');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects requests from a foreign origin', async () => {
    const res = await request(makeApp()).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('accepts requests from the configured web origin', async () => {
    await request(makeApp()).get('/api/health').set('Origin', WEB_ORIGIN).expect(200);
  });
});
