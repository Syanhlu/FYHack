import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/extension',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 7000 },
  reporter: 'list',
  outputDir: 'test-results',
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js apps/demo-profiles --host localhost --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
