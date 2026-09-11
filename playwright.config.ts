import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real Next.js server in mock mode
 * (WIFI_HEATMAPPER_MOCK=1): no sudo, no iperf3, synthetic measurements.
 * Survey files are written to .e2e-data/ so your own surveys are untouched.
 *
 * Locally:   npm run e2e          (starts `next dev` for you)
 * In CI:     npm run build && CI=1 npm run e2e   (uses `next start`)
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // the app has one global measurement slot
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    colorScheme: "light",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run e2e:serve:prod" : "npm run e2e:serve:dev",
    url: `${baseURL}/api/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
