// file: playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env["CI"];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: 'html',

  use: {
    baseURL: process.env['PLAYWRIGHT_TEST_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    headless: isCI, // headless in CI, headed locally
  },

  globalTeardown: './e2e/global-teardown.ts',

  // webServer: { ... } // keep commented if you start the app yourself

  projects: [
    {
      // Use Playwright's bundled Chromium on CI; real Chrome locally.
      name: isCI ? 'chromium' : 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        ...(isCI ? {} : { channel: 'chrome' }),
      },
    },
  ],
});
