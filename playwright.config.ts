import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real Next.js server in mock mode
 * (WIFI_HEATMAPPER_MOCK=1): no sudo, no iperf3, synthetic measurements.
 * Survey files are written to .e2e-data/ so your own surveys are untouched,
 * and reset before each test (e2e/fixtures.ts, WIFI_HEATMAPPER_E2E).
 *
 * Locally:   npm run e2e          (starts `next dev` on :3100 for you)
 * In CI:     npm run e2e:build && CI=1 npm run e2e   (uses `next start`)
 * The e2e server builds into .next-e2e, so it can run next to `npm run dev`.
 * E2E_PORT picks another port (default 3100), e.g. for parallel checkouts:
 * a server already on the port is reused, so two checkouts sharing one
 * would test each other's code.
 */
const PORT = Number(process.env.E2E_PORT || 3100);
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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: {
    // The scripts default to -p 3100; a later -p wins
    command: `npm run ${process.env.CI ? "e2e:serve:prod" : "e2e:serve:dev"} -- -p ${PORT}`,
    url: `${baseURL}/api/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
