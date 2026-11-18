import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/echoreader/',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/serve-dist.js',
    url: 'http://127.0.0.1:4173/echoreader/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
