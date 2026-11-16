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
