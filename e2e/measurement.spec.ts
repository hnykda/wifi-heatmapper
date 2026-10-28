import { test, expect } from "@playwright/test";
import {
  uploadFloorplan,
  gotoTab,
  measureAt,
  readSurvey,
  useSpeedServer,
} from "./helpers";

test("clicking the floor plan takes a measurement and stores it", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await expect(page.getByText("Click where you are standing")).toBeVisible();

  await measureAt(page, 0.3, 0.4);
  await expect(page.getByTestId("summary-points")).toContainText("1");
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toContainText("Measurement saved");
  // new surveys measure signal only, and say so
  await expect(panel).toHaveAttribute("data-mode", "signal");
  await expect(page.getByTestId("measurement-speed-off")).toContainText(
    "signal only",
  );
  await expect(page.getByTestId("summary-iperf")).toContainText("Signal only");
  await expect(page.getByTestId("summary-speed-warning")).toHaveCount(0);

  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  const p = survey.surveyPoints[0];
  expect(p.id).toBe("Point_1");
  expect(p.wifiData.ssid).toBe("Demo Network");
  expect(p.wifiData.signalStrength).toBeGreaterThan(0);
  expect(p.wifiData.signalStrength).toBeLessThanOrEqual(100);
  // the mock reports a noise floor, averaged over the readings
  expect(p.wifiData.noise).toBeGreaterThanOrEqual(-95);
  expect(p.wifiData.noise).toBeLessThanOrEqual(-90);
  expect(p.x).toBeCloseTo(800 * 0.3, -1);
  expect(p.y).toBeCloseTo(500 * 0.4, -1);
  // signal only by default: no speed
  expect(survey.measureSpeed).toBe(false);
  expect(p.iperfData.tcpDownload.bitsPerSecond).toBe(0);
});

test("with signal and speed, speed is measured too", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await useSpeedServer(page, "10.0.0.2");
  await expect(page.getByTestId("summary-iperf")).toContainText(
    "Signal and speed (10.0.0.2)",
  );
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.5, 0.5);
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toContainText("Measurement saved");
  await expect(panel).toHaveAttribute("data-mode", "speed");
  await expect(panel).toContainText("Download / upload");

  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  expect(
    survey.surveyPoints[0].iperfData.tcpDownload.bitsPerSecond,
  ).toBeGreaterThan(0);
  expect(
    survey.surveyPoints[0].iperfData.udpUpload.bitsPerSecond,
  ).toBeGreaterThan(0);
});

test("an unreachable speed test server still records the signal, with a warning", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await useSpeedServer(page, "unreachable.local");
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.5, 0.5);
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toHaveAttribute("data-warning", "true");
  await expect(panel).toContainText("Saved without speed");
  await expect(page.getByTestId("measurement-warning")).toContainText(
    "Can't reach the speed test server at unreachable.local:5201",
  );
  // the warning stays until dismissed, and the header keeps it visible
  await page.waitForTimeout(3000);
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("summary-speed-warning")).toContainText(
    "Newest point has no speed",
  );
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  expect(survey.surveyPoints[0].wifiData.signalStrength).toBeGreaterThan(0);
  expect(survey.surveyPoints[0].iperfData.tcpDownload.bitsPerSecond).toBe(0);
});

test("a speed survey without a server warns before measuring", async ({
  page,
}) => {
  await uploadFloorplan(page);
  await page.getByTestId("measure-mode-speed").click();
  await expect(page.getByTestId("summary-speed-warning")).toContainText(
    "No speed test server set",
  );
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.4, 0.4);
  await expect(page.getByTestId("measurement-warning")).toContainText(
    "No speed test server is set",
  );
});

test("a measurement can be cancelled", async ({ page }) => {
  const name = await uploadFloorplan(page);
  // speed tests with a long duration keep the mock busy for a few seconds
  await useSpeedServer(page, "10.0.0.2");
  await page.getByLabel("Test duration (seconds)").fill("10");
  await gotoTab(page, "floorplan");
  const canvas = page.getByTestId("floorplan-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.6 } });
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toHaveAttribute("data-phase", "running");
  await page.getByTestId("measurement-cancel").click();
  await expect(panel).toHaveAttribute("data-phase", "cancelled");
  await panel.getByRole("button", { name: "Dismiss" }).click();
  await expect(panel).toHaveCount(0);
  await page.waitForTimeout(500);
  const survey = await readSurvey(page, name);
  expect(survey.surveyPoints).toHaveLength(0);
});

test("points can be inspected, ignored and deleted from the plan", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.25, 0.5);
  await page.waitForTimeout(2600); // the success panel closes itself

  const canvas = page.getByTestId("floorplan-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: box.width * 0.25, y: box.height * 0.5 },
  });
  const details = page.getByTestId("point-details");
  await expect(details).toBeVisible();
  await expect(details).toContainText("Point_1");
  await expect(details).toContainText("Demo Network");
  await expect(details).toContainText(/Noise\s*-9\d dBm/);
  await expect(details).toContainText(/Signal-to-noise\s*\d+ dB/);

  await details.getByRole("switch").click();
  await expect(details).toContainText("Ignored");
  await expect(page.getByTestId("summary-points")).toContainText(
    "0 of 1 enabled",
  );

  await details.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete point" }).click();
  await expect(details).toHaveCount(0);
  await readSurvey(page, name, (s) => s.surveyPoints.length === 0);
});

test("sample points fill the plan in mock mode", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await page.getByTestId("add-sample-points").click();
  await expect(page.getByTestId("summary-points")).toContainText("24");
  // All 24 are added in one tick; every one of them must reach the file.
  await readSurvey(page, name, (s) => s.surveyPoints.length === 24);
});
