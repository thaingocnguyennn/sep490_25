import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end Playwright config for the DMS frontend.
 *
 * The suite exercises the three happy paths (Clerk creates → Head FORWARDs →
 * Specialist COMPLETEs), the RETURN_TO_HEAD loop, and the XDB read-only
 * visibility check. Tests assume:
 *   - The backend is reachable on BACKEND_URL (default http://localhost:5000).
 *   - The frontend is reachable on FRONTEND_URL (default http://localhost:3000).
 *   - The seeded users (admin, head, specialist, clerk) are present.
 *
 * CI starts both servers via `npm run start` and `vite preview`, but locally
 * you can also keep them on your dev shells; Playwright will just hit the
 * configured URLs.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
