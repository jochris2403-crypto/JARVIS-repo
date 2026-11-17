import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionResponseSchema } from '@jarvis/shared';
import { createTestApp, type TestApp } from '../test/test-app.js';

const PUBLIC = 'https://jarvis.example.com';
const LAN = 'http://192.168.1.20:4310';
const AUTH = { username: 'admin', password: 'correct horse', sessionTtlMs: 60_000 };

let current: TestApp | undefined;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

function makeApp(withAuth = true) {
  current = createTestApp({ publicOrigins: [PUBLIC, LAN], auth: withAuth ? AUTH : undefined });
  return current.app;
}

function sessionCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('jarvis_session='));
  if (!cookie) throw new Error('no session cookie set');
  return cookie;
}

describe('authentication enabled', () => {
  it('keeps health and the session probe public', async () => {
    const app = makeApp();
    await request(app).get('/api/health').expect(200);
    const res = await request(app).get('/api/auth/session').expect(200);
    expect(sessionResponseSchema.parse(res.body)).toEqual({
      authRequired: true,
      authenticated: false,
      username: null,
    });
  });

  it('rejects API calls without a session', async () => {
    const res = await request(makeApp()).get('/api/connections').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong password without setting a cookie', async () => {
    const res = await request(makeApp())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong password' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('signs in, grants access with the cookie, and signs out', async () => {
    const app = makeApp();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct horse' })
      .expect(200);
    const cookie = sessionCookie(login);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const token = cookie.split(';')[0]!;
    await request(app).get('/api/connections').set('Cookie', token).expect(200);
    const session = await request(app).get('/api/auth/session').set('Cookie', token);
    expect(session.body).toMatchObject({ authenticated: true, username: 'admin' });

    const logout = await request(app).post('/api/auth/logout').set('Cookie', token).expect(204);
    expect(sessionCookie(logout)).toMatch(/jarvis_session=;/);
  });

  it('rejects a tampered session token', async () => {
    const app = makeApp();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct horse' });
    const token = sessionCookie(login).split(';')[0]!;
    await request(app).get('/api/connections').set('Cookie', `${token}x`).expect(401);
  });

  it('marks the cookie Secure only for https origins', async () => {
    const app = makeApp();
    const body = { username: 'admin', password: 'correct horse' };
    const https = await request(app)
      .post('/api/auth/login')
      .set('Host', 'jarvis.example.com')
      .set('Origin', PUBLIC)
      .send(body);
    expect(sessionCookie(https)).toMatch(/Secure/);
    const lan = await request(app)
      .post('/api/auth/login')
      .set('Host', '192.168.1.20:4310')
      .set('Origin', LAN)
      .send(body);
    expect(sessionCookie(lan)).not.toMatch(/Secure/);
  });

  it('throttles repeated failures', async () => {
    const app = makeApp();
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ username: 'admin', password: 'nope' });
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct horse' })
      .expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('public origins', () => {
  it('accepts requests addressed to a configured public host', async () => {
    const app = makeApp();
    await request(app).get('/api/health').set('Host', 'jarvis.example.com').expect(200);
    await request(app)
      .get('/api/auth/session')
      .set('Host', '192.168.1.20:4310')
      .set('Origin', LAN)
      .expect(200);
  });

  it('still rejects other hosts', async () => {
    await request(makeApp()).get('/api/connections').set('Host', 'evil.example').expect(403);
    // …except the harmless health check, which platform probes address by internal name.
    await request(makeApp()).get('/api/health').set('Host', '10.0.0.7:4310').expect(200);
  });

  it('serves pages over plain http without upgrading asset requests', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
  });
});

describe('authentication disabled', () => {
  it('reports every caller as signed in and leaves the API open', async () => {
    const app = makeApp(false);
    const res = await request(app).get('/api/auth/session').expect(200);
    expect(res.body).toEqual({ authRequired: false, authenticated: true, username: null });
    await request(app).get('/api/connections').expect(200);
  });
});
