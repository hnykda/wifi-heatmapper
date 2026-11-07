/**
 * Settings > Nearby networks: each measurement also scans every network in
 * range (the mock hears the demo network on 2.4, 5 and 6 GHz, two
 * neighbours and a hidden one). Without a Wi-Fi connection the scan is
 * saved alone. The Heat maps tab draws a map per band and can hide networks.
 */
import { test, expect } from "./fixtures";
import { gotoTab, measureAt, readSurvey, uploadFloorplan } from "./helpers";

test("not connected: the scan alone is saved and drawn per band", async ({
  page,
  mock,
}) => {
  await mock.set({ wifi: "not-connected" });
  const name = await uploadFloorplan(page);
  await page.getByTestId("scan-nearby").click();
  await readSurvey(page, name, (s) => s.scanNearby === true);

  await gotoTab(page, "floorplan");
  await measureAt(page, 0.3, 0.4);
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toContainText("Measurement saved");
  await expect(page.getByTestId("measurement-not-connected")).toBeVisible();
  await expect(page.getByTestId("measurement-nearby")).toContainText(
    "access points",
  );
  await measureAt(page, 0.7, 0.6);

  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 2,
  );
  for (const point of survey.surveyPoints) {
    expect(point.wifiData.signalStrength).toBe(0);
    expect(point.iperfData.tcpDownload).toBeNull();
    expect(point.nearby.length).toBeGreaterThan(3);
    expect(point.nearby.map((n: { band: number }) => n.band)).toContain(6);
  }

  await gotoTab(page, "heatmaps");
  await expect(page.getByTestId("nearby-networks")).toBeVisible();
  // the connected signal map has no point to draw
  await expect(page.getByTestId("heatmap-signalStrength")).toContainText(
    "0 points",
  );

  // two independent reports: 5 GHz per network, 2.4 GHz per access point
  await page.getByTestId("nearby-band-5").click();
  await page.getByTestId("nearby-band-2-4").click();
  const five = page.getByTestId("nearby-report-5");
  const two = page.getByTestId("nearby-report-2-4");
  await expect(page.getByTestId("heatmap-nearby-5-all")).toContainText(
    "2 points",
  );
  await expect(page.getByTestId("heatmap-nearby-2-4-all")).toBeVisible();

  await page.getByTestId("nearby-split-5-network").click();
  await expect(
    page.getByTestId("heatmap-nearby-5-net:Demo Network"),
  ).toBeVisible();
  await expect(
    page.getByTestId("heatmap-nearby-5-net:Neighbour 5G"),
  ).toBeVisible();
  await page.getByTestId("nearby-split-2-4-accessPoint").click();
  // the demo network's two access points and the neighbour's, on 2.4 GHz
  await expect(two.locator("figure[data-testid^=heatmap-]")).toHaveCount(3);
  await expect(two).toContainText("Download all (3)");

  // leave the neighbour out of the 5 GHz report only
  const settings5 = page.getByTestId("nearby-report-settings-5");
  await page.getByTestId("nearby-aps-toggle-5").click();
  await settings5.getByText("Neighbour 5G").click();
  const survey2 = await readSurvey(page, name, (s) =>
    s.nearbyReports?.["5"]?.hidden?.includes("a1b2c3d4e5f6"),
  );
  expect(survey2.nearbyReports["5"].split).toBe("network");
  expect(survey2.nearbyReports["2.4"]).toEqual({
    shown: true,
    hidden: [],
    split: "accessPoint",
  });
  await expect(
    page.getByTestId("heatmap-nearby-5-net:Neighbour 5G"),
  ).toHaveCount(0);
  await expect(five.locator("figure[data-testid^=heatmap-]")).toHaveCount(2);
  await expect(two.locator("figure[data-testid^=heatmap-]")).toHaveCount(3);

  // nothing ticked: the report says so instead of drawing 0% everywhere
  await page.getByTestId("nearby-aps-none-5").click();
  await expect(five).toContainText("No access points are ticked");
  await page.getByTestId("nearby-aps-all-5").click();
  await readSurvey(page, name, (s) => s.nearbyReports["5"].hidden.length === 0);
});

test("connected: the scan is saved with the signal; a failed scan isn't fatal", async ({
  page,
  mock,
}) => {
  const name = await uploadFloorplan(page);
  await page.getByTestId("scan-nearby").click();
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.5, 0.5);
  await expect(page.getByTestId("measurement-nearby")).toContainText(
    "access points",
  );

  await mock.set({ scan: "fails" });
  await page.getByTestId("measurement-panel").waitFor({ state: "detached" });
  await measureAt(page, 0.2, 0.2);
  await expect(page.getByTestId("measurement-nearby")).toHaveText("Failed");

  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 2,
  );
  const [scanned, unscanned] = survey.surveyPoints;
  expect(scanned.wifiData.signalStrength).toBeGreaterThan(0);
  expect(scanned.nearby.length).toBeGreaterThan(3);
  expect(unscanned.wifiData.signalStrength).toBeGreaterThan(0);
  expect(unscanned.nearby).toBeUndefined();
});
