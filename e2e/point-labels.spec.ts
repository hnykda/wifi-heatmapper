/**
 * Naming survey points (#43): the label is edited in place in the point's
 * popup and in the points table, saved by the server, and shown instead
 * of the id. The id itself never changes.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { gotoTab, measureAt, readSurvey, uploadFloorplan } from "./helpers";

/** Open the popup of the point at (fx, fy) of the floor plan. */
async function openPoint(page: Page, fx: number, fy: number) {
  const canvas = page.getByTestId("floorplan-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  const details = page.getByTestId("point-details");
  await expect(details).toBeVisible();
  return details;
}

const labelOf = (survey: { surveyPoints: { label?: string }[] }) =>
  survey.surveyPoints[0]?.label;

test("a point can be named in its popup and in the table, and the CSV has it", async ({
  page,
  mock,
}) => {
  await mock.set({ signal: 70 });
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.25, 0.5);
  const panel = page.getByTestId("measurement-panel");
  await panel
    .getByRole("button", { name: "Dismiss" })
    .click({ timeout: 2000 })
    .catch(() => {}); // it may have closed itself
  await expect(panel).toHaveCount(0);

  // without a name the popup shows the id
  let details = await openPoint(page, 0.25, 0.5);
  const title = details.getByTestId("point-name");
  await expect(title).toHaveText(/Point_1/);

  // click, type, Enter saves
  await title.click();
  const input = details.getByTestId("point-name-input");
  await expect(input).toBeFocused();
  await input.fill("  Kitchen ");
  await input.press("Enter");
  await expect(details.getByTestId("point-name")).toHaveText(/^Kitchen/);
  await expect(details).toContainText("Point_1 ·"); // the id stays visible
  let survey = await readSurvey(page, name, (s) => labelOf(s) === "Kitchen");
  expect(survey.surveyPoints[0].id).toBe("Point_1");

  // Escape cancels, and leaves the popup open
  await details.getByTestId("point-name").click();
  await details.getByTestId("point-name-input").fill("Not this");
  await details.getByTestId("point-name-input").press("Escape");
  await expect(details).toBeVisible();
  await expect(details.getByTestId("point-name")).toHaveText(/^Kitchen/);

  // leaving the field saves
  await details.getByTestId("point-name").click();
  await details.getByTestId("point-name-input").fill("Kitchen table");
  await details.getByTestId("point-name-input").blur();
  await expect(details.getByTestId("point-name")).toHaveText(/^Kitchen table/);
  await readSurvey(page, name, (s) => labelOf(s) === "Kitchen table");
  survey = await readSurvey(page, name);
  expect(labelOf(survey)).toBe("Kitchen table"); // Escape saved nothing

  // the name survives a reload
  await page.reload();
  // a reload opens the default survey: open this one again
  await gotoTab(page, "settings");
  await page.getByTestId("floorplan-picker").click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByTestId("summary-floorplan")).toContainText(name);
  await expect(page.getByTestId("summary-points")).toContainText("1");
  await gotoTab(page, "floorplan");
  details = await openPoint(page, 0.25, 0.5);
  await expect(details.getByTestId("point-name")).toHaveText(/^Kitchen table/);

  // the table shows it and can rename it too
  await gotoTab(page, "points");
  const row = page.getByTestId("points-row");
  await expect(row).toHaveCount(1);
  // the id column is hidden by default: the name stands in for it
  await expect(row).toContainText("Kitchen table");
  await expect(row).not.toContainText("Point_1");
  await row.getByTestId("point-name").click();
  await row.getByTestId("point-name-input").fill("Hall");
  await row.getByTestId("point-name-input").press("Enter");
  await expect(row.getByTestId("point-name")).toHaveText(/^Hall/);
  await readSurvey(page, name, (s) => labelOf(s) === "Hall");

  // the CSV has a label column next to the id
  const download = page.waitForEvent("download");
  await page.getByTestId("export-csv").click();
  const csv = Buffer.concat(
    await (await (await download).createReadStream()).toArray(),
  ).toString("utf8");
  const [header, line] = csv.trim().split("\n");
  expect(header.startsWith("id,label,")).toBe(true);
  expect(line.startsWith("Point_1,Hall,")).toBe(true);

  // an empty name goes back to the id
  await row.getByTestId("point-name").click();
  await row.getByTestId("point-name-input").fill("");
  await row.getByTestId("point-name-input").press("Enter");
  await expect(row.getByTestId("point-name")).toHaveText(/^Point_1/);
  await readSurvey(page, name, (s) => labelOf(s) === undefined);
});
