import { test, expect } from "./fixtures";
import { uploadFloorplan, gotoTab, readSurvey } from "./helpers";

test("the points table pages through more than 25 points", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  // 24 sample points per click: two clicks make two pages of 25
  await page.getByTestId("add-sample-points").click();
  await readSurvey(page, name, (s) => s.surveyPoints.length === 24);
  await page.getByTestId("add-sample-points").click();
  await readSurvey(page, name, (s) => s.surveyPoints.length === 48);

  await gotoTab(page, "points");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  const next = page.getByRole("button", { name: "Next", exact: true });
  const previous = page.getByRole("button", { name: "Previous" });
  await expect(previous).toBeDisabled();

  // Scrolled to the end, the pager must clear the floating help button in
  // the bottom-right corner, or that button takes the clicks
  await page.mouse.wheel(0, 10_000);
  await expect(async () => {
    const pager = await next.boundingBox();
    const help = await page.getByTestId("help-button").boundingBox();
    expect(pager && help).toBeTruthy();
    expect(pager!.y + pager!.height).toBeLessThanOrEqual(help!.y);
  }).toPass();

  await next.click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();

  await previous.click();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
});
