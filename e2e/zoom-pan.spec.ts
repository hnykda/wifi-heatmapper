/**
 * Zoom and pan on the floor plan and in the enlarged heat map: the
 * controls, ctrl + wheel at the cursor, keyboard, and that clicks still
 * land on the right spot of the image while a drag does not measure.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { gotoTab, readSurvey, uploadFloorplan } from "./helpers";

// uploadFloorplan's default image size
const W = 800;
const H = 500;

async function frameBox(page: Page) {
  const canvas = page.getByTestId("floorplan-canvas");
  await expect(canvas).toBeVisible();
  return (await canvas.boundingBox())!;
}

async function waitForSavedPoint(page: Page, name: string) {
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toHaveAttribute("data-phase", "done", {
    timeout: 30_000,
  });
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  return survey.surveyPoints[0] as { x: number; y: number };
}

test("zoom buttons, keyboard and ctrl + wheel change the zoom", async ({
  page,
}) => {
  await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  const level = page.getByTestId("zoom-level");
  await expect(level).toHaveText("100%");
  await expect(page.getByTestId("zoom-out")).toBeDisabled();
  await expect(page.getByTestId("zoom-fit")).toBeDisabled();

  await page.getByTestId("zoom-in").click();
  await expect(level).toHaveText("150%");
  await page.getByTestId("zoom-in").click();
  await expect(level).toHaveText("200%");
  await page.getByTestId("zoom-out").click();
  await expect(level).toHaveText("150%");
  await page.getByTestId("zoom-fit").click();
  await expect(level).toHaveText("100%");

  // keyboard, with the plan focused
  const viewport = page.getByTestId("floorplan-viewport");
  await viewport.focus();
  await page.keyboard.press("+");
  await expect(level).toHaveText("150%");
  await page.keyboard.press("-");
  await expect(level).toHaveText("100%");
  await page.keyboard.press("+");
  await page.keyboard.press("0");
  await expect(level).toHaveText("100%");

  // a plain wheel scrolls the page and leaves the zoom alone
  const box = await frameBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(200);
  await expect(level).toHaveText("100%");

  // ctrl + wheel (and a trackpad pinch, which arrives as one) zooms
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(level).not.toHaveText("100%");
});

test("a click on a zoomed plan measures the spot under the cursor", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await page.getByTestId("zoom-in").click();
  await page.getByTestId("zoom-in").click();
  await expect(page.getByTestId("zoom-level")).toHaveText("200%");

  // At 200% around the centre the frame shows the middle half of the plan:
  // a quarter of the way in is (W/2 - W/8, H/2 - H/8) on the image.
  const box = await frameBox(page);
  await page
    .getByTestId("floorplan-canvas")
    .click({ position: { x: box.width * 0.25, y: box.height * 0.25 } });
  const point = await waitForSavedPoint(page, name);
  expect(Math.abs(point.x - (W / 2 - W / 8))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(point.y - (H / 2 - H / 8))).toBeLessThanOrEqual(1.5);
});

test("ctrl + wheel zooms at the cursor", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  const box = await frameBox(page);
  // at fit this is image point (0.7 W, 0.6 H); zooming keeps it there
  const at = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.6 };
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByTestId("zoom-level")).not.toHaveText("100%");
  await page.mouse.click(at.x, at.y);
  const point = await waitForSavedPoint(page, name);
  expect(Math.abs(point.x - 0.7 * W)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(point.y - 0.6 * H)).toBeLessThanOrEqual(1.5);
});

test("dragging pans and does not start a measurement", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await page.getByTestId("zoom-in").click();
  await page.getByTestId("zoom-in").click();
  const viewport = page.getByTestId("floorplan-viewport");
  const before = await viewport.getAttribute("data-center");

  const box = await frameBox(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 150, start.y - 80, { steps: 8 });
  await page.mouse.up();

  await expect(viewport).not.toHaveAttribute("data-center", before!);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("measurement-panel")).toHaveCount(0);
  expect((await readSurvey(page, name)).surveyPoints).toHaveLength(0);

  // a small wobble is still a click, and the next click measures
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 2, start.y + 1);
  await page.mouse.up();
  await expect(page.getByTestId("measurement-panel")).toHaveAttribute(
    "data-phase",
    "running",
  );
  await waitForSavedPoint(page, name);
});

test("a tall floor plan fits the window instead of scrolling", async ({
  page,
}) => {
  await uploadFloorplan(page, undefined, [500, 2000]);
  await gotoTab(page, "floorplan");
  const box = await frameBox(page);
  const windowHeight = page.viewportSize()!.height;
  expect(box.height).toBeLessThanOrEqual(windowHeight - 100);
  expect(box.width / box.height).toBeCloseTo(500 / 2000, 2);
});

test("the enlarged heat map zooms and pans", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await page.getByTestId("add-sample-points").click();
  await readSurvey(page, name, (s) => s.surveyPoints.length === 24);
  await gotoTab(page, "heatmaps");
  await expect(
    page.getByTestId("heatmap-signalStrength").locator("img"),
  ).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole("button", { name: "Enlarge Signal strength" })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  const viewport = dialog.getByTestId("heatmap-viewport");
  await expect(viewport.locator("img")).toBeVisible();
  const level = dialog.getByTestId("zoom-level");
  await expect(level).toHaveText("100%");
  await dialog.getByTestId("zoom-in").click();
  await dialog.getByTestId("zoom-in").click();
  await expect(level).toHaveText("200%");

  const before = await viewport.getAttribute("data-center");
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("data-center", before!);

  await dialog.getByTestId("zoom-fit").click();
  await expect(level).toHaveText("100%");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
