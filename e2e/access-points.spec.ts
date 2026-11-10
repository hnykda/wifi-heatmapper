/**
 * Access point markers (#154): "Add access point" places a router marker
 * with the next click, its popup names it and takes a note, dragging moves
 * it, and Remove deletes it. Markers are saved with the survey and are
 * never measurements: placing one starts no measurement.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { gotoTab, readSurvey, uploadFloorplan } from "./helpers";

/** A spot on the canvas, as a fraction of its size, in page coords. */
async function at(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("floorplan-canvas").boundingBox())!;
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
  const spot = await at(page, 0.3, 0.4);
  await page.mouse.click(spot.x, spot.y);
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
  const away = await at(page, 0.8, 0.8);
  await page.mouse.click(away.x, away.y);
  await expect(details).toHaveCount(0);
  await expect(page.getByTestId("measurement-panel")).toHaveCount(0);
  await page.mouse.click(away.x, away.y);
  await expect(page.getByTestId("measurement-panel")).toHaveAttribute(
    "data-phase",
    "done",
    { timeout: 30_000 },
  );
  await page.mouse.click(spot.x, spot.y);
  await expect(details).toBeVisible();
  await expect(details.getByTestId("access-point-name")).toHaveValue(
    "Living room",
  );
  await page.mouse.click(spot.x, spot.y);
  await expect(details).toHaveCount(0);

  // dragging the marker moves it (and doesn't pan the plan or measure)
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
  await page.mouse.click(to.x, to.y);
  await expect(details).toBeVisible();
  await details.getByTestId("access-point-delete").click();
  await expect(details).toHaveCount(0);
  survey = await readSurvey(page, name, (s) => s.accessPoints.length === 0);
  expect(survey.surveyPoints).toHaveLength(1);
});
