import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const port = Number(process.env.MIMORI_SMOKE_PORT || 3107);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['authenticated-onboarding.spec.ts', 'login.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: 'test-results/authenticated-onboarding',
  use: { baseURL, trace: 'off', screenshot: 'only-on-failure',
    launchOptions: process.env.MIMORI_BROWSER_PATH ? { executablePath: process.env.MIMORI_BROWSER_PATH } : {} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DISABLE_AUTH: 'false', MIMORI_DIST_DIR: '.next-auth-smoke', CRON_SECRET: 'worker-smoke-only' }
  }
});
