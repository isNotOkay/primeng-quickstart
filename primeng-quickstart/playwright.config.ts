// playwright.config.ts
import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: process.env['PLAYWRIGHT_TEST_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    headless: false,
  },

  globalTeardown: './e2e/global-teardown.ts',

  // webServer: { ... } // keep commented if you start the app yourself

  projects: [
    {
      name: 'chrome',
      use: {...devices['Desktop Chrome'], channel: 'chrome'},
    },
    // If you still want Edge, add it back alongside Chrome.
    // { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
  ],
});
