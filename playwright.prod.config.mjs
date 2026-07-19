import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /production-smoke\.spec\.ts/,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: true,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://dojo.ninja360.co',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
});
