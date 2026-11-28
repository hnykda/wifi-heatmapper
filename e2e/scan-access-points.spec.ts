/**
 * Settings > Scan all access points: each measurement also records every
 * access point in range (the mock hears the demo network's two access
 * points on 2.4, 5 and 6 GHz, two neighbours and a hidden network). The
 * Heat maps tab can then draw the scanned signal of a network: the best of
 * its access points, per band, or per access point.
 */
import { test, expect } from "./fixtures";
import { gotoTab, measureAt, readSurvey, uploadFloorplan } from "./helpers";

test("off: nothing about scans shows anywhere", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.5, 0.5);
  await expect(page.getByTestId("measurement-nearby")).toHaveCount(0);
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  expect(survey.surveyPoints[0].nearby).toBeUndefined();

  await gotoTab(page, "heatmaps");
  await expect(page.getByTestId("heatmap-signalStrength")).toBeVisible();
  await expect(page.locator("#metric-scanned")).toHaveCount(0);
  await expect(page.getByTestId("scanned-signal")).toHaveCount(0);
});

test("on: the scan is saved with the point and drawn per band and per access point", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await page.getByTestId("scan-nearby").click();
  await readSurvey(page, name, (s) => s.scanNearby === true);
  await gotoTab(page, "floorplan");
  const panel = page.getByTestId("measurement-panel");
  for (const [fx, fy] of [
    [0.25, 0.3],
    [0.5, 0.6],
    [0.75, 0.3],
  ]) {
    await measureAt(page, fx, fy);
    await expect(page.getByTestId("measurement-nearby")).toContainText(
      "access points",
    );
    await panel.waitFor({ state: "detached" });
  }
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 3,
  );
  for (const point of survey.surveyPoints) {
    expect(point.wifiData.signalStrength).toBeGreaterThan(0);
    expect(point.nearby.length).toBeGreaterThan(3);
  }

  // the point's details list what was in range, folded away
  const canvas = page.getByTestId("floorplan-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.6 } });
  const inRange = page.getByTestId("point-nearby");
  await expect(inRange).toContainText("access points in range");
  await inRange.locator("summary").click();
  await expect(inRange.locator("li").first()).toContainText("GHz");

  // Heat maps: nothing new until Scanned signal is ticked
  await gotoTab(page, "heatmaps");
  await expect(page.getByTestId("heatmap-signalStrength")).toBeVisible();
  await expect(page.getByTestId("scanned-signal")).toHaveCount(0);
  await page.locator("#metric-scanned").click();
  const group = page.getByTestId("scanned-signal");
  // the survey's own network to start with, the neighbours in the list
  await expect(page.getByTestId("scan-network")).toHaveValue("Demo Network");
  await expect(
    page.getByTestId("scan-network").locator("option"),
  ).toContainText(["Demo Network", "Neighbour"]);
  await expect(page.getByTestId("heatmap-scan-best")).toBeVisible();

  await group.getByTestId("scan-split-band").click();
  await expect(page.getByTestId("heatmap-scan-best")).toHaveCount(0);
  for (const band of ["2.4", "5", "6"]) {
    await expect(page.getByTestId(`heatmap-scan-band-${band}`)).toBeVisible();
  }

  // unnamed radios are one map each: two access points on three bands
  await group.getByTestId("scan-split-accessPoint").click();
  await expect(page.locator('[data-testid^="heatmap-scan-ap-"]')).toHaveCount(
    5,
  );
  // the connection's own map is still there
  await expect(page.getByTestId("heatmap-signalStrength")).toBeVisible();
});

test("a failed scan doesn't lose the point, and says why", async ({
  page,
  mock,
}) => {
  const name = await uploadFloorplan(page);
  await page.getByTestId("scan-nearby").click();
  await readSurvey(page, name, (s) => s.scanNearby === true);
  await gotoTab(page, "floorplan");
  await mock.set({ scan: "fails" });
  await measureAt(page, 0.4, 0.4);
  await expect(page.getByTestId("measurement-nearby")).toHaveText("Failed");
  await expect(page.getByTestId("measurement-scan-note")).toContainText(
    "Saved without the scan",
  );
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  expect(survey.surveyPoints[0].wifiData.signalStrength).toBeGreaterThan(0);
  expect(survey.surveyPoints[0].nearby).toBeUndefined();
});
