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
    // The Dojo sits behind a password (functions/_middleware.js). With DOJO_USER and DOJO_PASS set —
    // the workflow passes them from repo secrets — Playwright answers the login challenge.
    ...(process.env.DOJO_USER && process.env.DOJO_PASS
      ? { httpCredentials: { username: process.env.DOJO_USER, password: process.env.DOJO_PASS } }
      : {}),
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
