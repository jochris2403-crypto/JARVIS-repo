import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Credentials for the project-local dev MySQL instance, written by `npm run db:init`.
const envTest = fileURLToPath(new URL('../../.env.test', import.meta.url));
if (fs.existsSync(envTest)) process.loadEnvFile(envTest);

export default defineConfig({
  resolve: {
    // Resolve @jarvis/shared to its TypeScript source during tests.
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
