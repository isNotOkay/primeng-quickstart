// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

// HEADLESS=1 (or "true"/"yes") -> run headless
const isHeadless =
  ['1', 'true', 'yes'].includes(String(process.env["HEADLESS"] ?? '').toLowerCase());

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,

  // Only forbid .only when running headless (typically in CI or scripted mode)
  forbidOnly: isHeadless,
  retries: 0,

  // Show progress in the terminal; also generate HTML report without opening it
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: process.env['PLAYWRIGHT_TEST_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    headless: isHeadless, // headless when HEADLESS=1; headed otherwise
  },

  globalTeardown: './e2e/global-teardown.ts',

  projects: [
    {
      // Use bundled Chromium when headless; real Chrome when headed.
      name: isHeadless ? 'chromium' : 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        ...(isHeadless ? {} : { channel: 'chrome' }),
      },
    },
  ],
});
