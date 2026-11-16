import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run a dedicated stack on its own ports with its own data
// directory, so they never touch a developer's running instance or ~/.jarvis.
const WEB_PORT = 5183;
const API_PORT = 4320;
const WEB_URL = `http://localhost:${WEB_PORT}`;
// Absolute: the server runs from apps/server, so a relative path would resolve there.
const DATA_DIR = path.resolve('.jarvis-data/e2e');

// Credentials for the project-local dev MySQL instance (`npm run db:init`).
if (fs.existsSync('.env.test')) process.loadEnvFile('.env.test');

// On machines with an HTTP proxy configured, keep loopback traffic (the dev
// server readiness probe and API requests) off the proxy.
const loopback = 'localhost,127.0.0.1,::1';
for (const name of ['NO_PROXY', 'no_proxy']) {
  process.env[name] = process.env[name] ? `${process.env[name]},${loopback}` : loopback;
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // Start from an empty data directory every run.
    command: `rm -rf "${DATA_DIR}" && npm run dev`,
    url: WEB_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      JARVIS_PORT: String(API_PORT),
      JARVIS_WEB_PORT: String(WEB_PORT),
      JARVIS_WEB_ORIGIN: WEB_URL,
      JARVIS_API_URL: `http://127.0.0.1:${API_PORT}`,
      JARVIS_DATA_DIR: DATA_DIR,
      JARVIS_LOG_LEVEL: 'warn',
    },
  },
});
