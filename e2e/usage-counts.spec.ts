import { test, expect } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The e2e server runs in mock mode with its data in .e2e-data
const STATE_FILE = join(process.cwd(), ".e2e-data", "usage-counts.json");
const hasInstallId = () =>
  existsSync(STATE_FILE) &&
  "installId" in JSON.parse(readFileSync(STATE_FILE, "utf-8"));

test("usage counts are off in mock mode and Settings says why", async ({
  page,
}) => {
  const info = await (await page.request.get("/api/telemetry")).json();
  expect(info).toMatchObject({
    enabled: false,
    offReason: "mock",
    showNotice: false,
    lastSent: null,
  });
  // the install id never appears, and none was made
  expect(info.sample.headers["User-Agent"]).toContain("<random install id>");
  expect(hasInstallId()).toBe(false);

  await page.goto("/#settings");
  // no first-run notice while it is off
  await expect(page.getByTestId("tab-settings")).toBeVisible();
  await expect(page.getByTestId("usage-notice")).toHaveCount(0);

  const toggle = page.getByTestId("usage-toggle");
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("data-state", "unchecked");
  await expect(page.getByTestId("usage-status")).toContainText(
    "Off in mock mode",
  );
  await expect(page.getByTestId("usage-last-sent")).toContainText(
    "Nothing sent from this computer yet.",
  );
  // the exact event, from the server's own builder
  const sample = page.getByTestId("usage-sample");
  await expect(sample).toContainText('"name": "Measurement"');
  await expect(sample).toContainText(
    '"domain": "app.wifi-heatmapper.danielalder.cz"',
  );
  await expect(sample).toContainText("User-Agent: wifi-heatmapper/");
  await expect(page.getByTestId("usage-privacy-link")).toHaveAttribute(
    "href",
    "https://wifi-heatmapper.danielalder.cz/docs/privacy",
  );

  // a bug report says it is off, without any id
  const report = await (await page.request.get("/api/diagnostics")).json();
  expect(report.summary).toContain("Usage counts: off (mock)");

  // dismissing the notice is allowed but makes no install id either
  const res = await page.request.patch("/api/telemetry", {
    data: { noticeDismissed: true },
  });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).enabled).toBe(false);
  expect(hasInstallId()).toBe(false);
  const bad = await page.request.patch("/api/telemetry", {
    data: { installId: "x" },
  });
  expect(bad.status()).toBe(400);
});
