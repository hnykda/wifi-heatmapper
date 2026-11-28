/**
 * Access point markers (#154): "Add access point" places a router marker
 * with the next click, its popup names it and takes a note, dragging moves
 * it, and Remove deletes it. Markers are saved with the survey and are
 * never measurements: placing one starts no measurement.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { gotoTab, readSurvey, uploadFloorplan } from "./helpers";

/** Click a spot of the canvas, as a fraction of its size. */
async function clickAt(page: Page, fx: number, fy: number) {
  const canvas = page.getByTestId("floorplan-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
}

/**
 * A spot of the canvas in page coords, read just before it is used: the
 * page may scroll (a focused field is scrolled into view).
 */
async function at(page: Page, fx: number, fy: number) {
  const canvas = page.getByTestId("floorplan-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test("an access point can be placed, named, noted, moved and removed", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  const canvas = page.getByTestId("floorplan-canvas");
  await expect(canvas).toBeVisible();

  // the next click places a marker, not a measurement
  await page.getByTestId("add-access-point").click();
  await expect(page.getByTestId("placing-access-point-hint")).toBeVisible();
  await clickAt(page, 0.3, 0.4);
  await expect(page.getByTestId("placing-access-point-hint")).toHaveCount(0);
  await expect(page.getByTestId("measurement-panel")).toHaveCount(0);

  // its popup opens: name and note save when you leave the field
  const details = page.getByTestId("access-point-details");
  await expect(details).toBeVisible();
  await details.getByTestId("access-point-name").fill("Living room");
  await details.getByTestId("access-point-name").press("Enter");
  await details
    .getByTestId("access-point-note")
    .fill("On the bookshelf, antennas up");
  await details.getByTestId("access-point-note").blur();
  let survey = await readSurvey(
    page,
    name,
    (s) => s.accessPoints?.[0]?.note === "On the bookshelf, antennas up",
  );
  expect(survey.accessPoints).toEqual([
    {
      id: "AP_1",
      x: expect.closeTo(240, -1),
      y: expect.closeTo(200, -1),
      name: "Living room",
      note: "On the bookshelf, antennas up",
    },
  ]);
  expect(survey.surveyPoints).toEqual([]);
  const before = survey.accessPoints[0];

  // click away closes it (and measures nothing); the next click measures
  await clickAt(page, 0.8, 0.8);
  await expect(details).toHaveCount(0);
  await expect(page.getByTestId("measurement-panel")).toHaveCount(0);
  await clickAt(page, 0.8, 0.8);
  await expect(page.getByTestId("measurement-panel")).toHaveAttribute(
    "data-phase",
    "done",
    { timeout: 30_000 },
  );
  await clickAt(page, 0.3, 0.4);
  await expect(details).toBeVisible();
  await expect(details.getByTestId("access-point-name")).toHaveValue(
    "Living room",
  );
  await clickAt(page, 0.3, 0.4);
  await expect(details).toHaveCount(0);

  // dragging the marker moves it (and doesn't pan the plan or measure)
  const spot = await at(page, 0.3, 0.4);
  const to = await at(page, 0.6, 0.3);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.move((spot.x + to.x) / 2, (spot.y + to.y) / 2, {
    steps: 4,
  });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  survey = await readSurvey(
    page,
    name,
    (s) => s.accessPoints?.[0]?.x !== before.x,
  );
  expect(survey.accessPoints[0]).toMatchObject({
    id: "AP_1",
    name: "Living room",
    x: expect.closeTo(480, -1),
    y: expect.closeTo(150, -1),
  });
  expect(survey.surveyPoints).toHaveLength(1);
  await expect(details).toHaveCount(0); // a drag is not a click

  // Escape cancels placing another
  await page.getByTestId("add-access-point").click();
  await expect(page.getByTestId("placing-access-point-hint")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("placing-access-point-hint")).toHaveCount(0);

  // Remove deletes it
  await clickAt(page, 0.6, 0.3);
  await expect(details).toBeVisible();
  await details.getByTestId("access-point-delete").click();
  await expect(details).toHaveCount(0);
  survey = await readSurvey(page, name, (s) => s.accessPoints.length === 0);
  expect(survey.surveyPoints).toHaveLength(1);
});

test("ticking a measured BSSID names its points after the marker", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await expect(page.getByTestId("floorplan-canvas")).toBeVisible();

  // one measurement, then a marker next to it
  await clickAt(page, 0.6, 0.5);
  await expect(page.getByTestId("measurement-panel")).toHaveAttribute(
    "data-phase",
    "done",
    { timeout: 30_000 },
  );
  let survey = await readSurvey(page, name, (s) => s.surveyPoints.length === 1);
  const bssid: string = survey.surveyPoints[0].wifiData.bssid;
  expect(bssid).not.toBe("");

  await page.getByTestId("add-access-point").click();
  await clickAt(page, 0.3, 0.4);
  const details = page.getByTestId("access-point-details");
  await expect(details).toBeVisible();
  await details.getByTestId("access-point-name").fill("Hall");
  await details.getByTestId("access-point-name").press("Enter");

  // the measured BSSID is listed; ticking it names it "Hall"
  const box = details.getByTestId("access-point-bssid");
  await expect(box).toHaveCount(1);
  await box.click();
  await expect(box).toHaveAttribute("data-state", "checked");
  survey = await readSurvey(page, name, (s) => s.apMapping.length === 1);
  expect(survey.apMapping).toEqual([
    { apName: "Hall", macAddress: bssid.replace(/[:-]/g, "").toLowerCase() },
  ]);

  // another icon
  await details.getByTestId("access-point-icon-wifi").click();
  await readSurvey(page, name, (s) => s.accessPoints[0].icon === "wifi");

  // renaming the marker renames its BSSID too
  await details.getByTestId("access-point-name").fill("Lobby");
  await details.getByTestId("access-point-name").press("Enter");
  survey = await readSurvey(
    page,
    name,
    (s) => s.apMapping[0]?.apName === "Lobby",
  );
  expect(survey.accessPoints[0].name).toBe("Lobby");

  // the point's details show the name
  await clickAt(page, 0.9, 0.9); // closes the marker's popup
  await clickAt(page, 0.6, 0.5);
  const point = page.getByTestId("point-details");
  await expect(point).toBeVisible();
  await expect(point.getByTestId("ap-chip")).toHaveText("Lobby");
});
