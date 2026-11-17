import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig({});
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4310);
    expect(config.allowedOrigins).toContain('http://localhost:5173');
    expect(config.allowedOrigins).toContain('http://127.0.0.1:5173');
  });

  it('reports every invalid variable', () => {
    expect(() => loadConfig({ JARVIS_PORT: '99999', JARVIS_WEB_ORIGIN: 'not a url' })).toThrow(
      /JARVIS_PORT[\s\S]*JARVIS_WEB_ORIGIN|JARVIS_WEB_ORIGIN[\s\S]*JARVIS_PORT/,
    );
  });
});

describe('loadConfig — network exposure', () => {
  it('uses the platform PORT when JARVIS_PORT is unset', () => {
    expect(loadConfig({ PORT: '10000' }).port).toBe(10000);
    expect(loadConfig({ PORT: '10000', JARVIS_PORT: '4400' }).port).toBe(4400);
  });

  it('keeps authentication off by default', () => {
    expect(loadConfig({}).auth).toBeUndefined();
  });

  it('refuses to listen on a non-loopback interface without a password', () => {
    expect(() => loadConfig({ JARVIS_HOST: '0.0.0.0' })).toThrow(/JARVIS_AUTH_PASSWORD/);
    expect(() => loadConfig({ JARVIS_PUBLIC_ORIGIN: 'https://jarvis.example.com' })).toThrow(
      /JARVIS_AUTH_PASSWORD/,
    );
  });

  it('rejects short passwords and malformed public origins', () => {
    expect(() => loadConfig({ JARVIS_AUTH_PASSWORD: 'short' })).toThrow(/at least 8/);
    expect(() =>
      loadConfig({ JARVIS_AUTH_PASSWORD: 'long-enough', JARVIS_PUBLIC_ORIGIN: 'ftp://x' }),
    ).toThrow(/JARVIS_PUBLIC_ORIGIN/);
  });

  it('builds the deployment configuration', () => {
    const config = loadConfig({
      JARVIS_HOST: '0.0.0.0',
      JARVIS_AUTH_PASSWORD: 'correct horse',
      JARVIS_PUBLIC_ORIGIN: 'https://jarvis.example.com/, http://192.168.1.20:4310',
      JARVIS_TRUST_PROXY: '1',
    });
    expect(config.auth).toMatchObject({ username: 'admin', password: 'correct horse' });
    expect(config.publicOrigins).toEqual([
      'https://jarvis.example.com',
      'http://192.168.1.20:4310',
    ]);
    expect(config.allowedOrigins).toContain('https://jarvis.example.com');
    expect(config.trustProxy).toBe(1);
  });

  it('picks up the public URL injected by hosting platforms', () => {
    const base = { JARVIS_HOST: '0.0.0.0', JARVIS_AUTH_PASSWORD: 'correct horse' };
    expect(
      loadConfig({ ...base, RAILWAY_PUBLIC_DOMAIN: 'jarvis.up.railway.app' }).publicOrigins,
    ).toEqual(['https://jarvis.up.railway.app']);
    expect(loadConfig({ ...base, FLY_APP_NAME: 'jarvis' }).publicOrigins).toEqual([
      'https://jarvis.fly.dev',
    ]);
  });
});
