import { test, expect } from "@playwright/test";
import { uploadFloorplan, gotoTab, readSurvey } from "./helpers";

test.describe("with sample points", () => {
  let name: string;

  test.beforeEach(async ({ page }) => {
    name = await uploadFloorplan(page);
    await gotoTab(page, "floorplan");
    await page.getByTestId("add-sample-points").click();
    await expect(page.getByTestId("summary-points")).toContainText("24");
  });

  test("heat maps render for signal and throughput", async ({ page }) => {
    await gotoTab(page, "heatmaps");
    const signal = page.getByTestId("heatmap-signalStrength").locator("img");
    await expect(signal).toBeVisible({ timeout: 30_000 });
    await expect(signal).toHaveAttribute("src", /^data:image\/png/);
    await expect(page.getByTestId("heatmap-signalStrength")).toContainText(
      "24 points",
    );

    await page.getByLabel("TCP download").click();
    const tcp = page
      .getByTestId("heatmap-tcpDownload-bitsPerSecond")
      .locator("img");
    await expect(tcp).toBeVisible({ timeout: 30_000 });

    // radius: automatic by default, manual after dragging
    await expect(page.getByTestId("radius-control")).toContainText("(auto)");
    const slider = page.getByRole("slider", {
      name: "Radius of each heat spot",
    });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("radius-control")).not.toContainText(
      "(auto)",
    );
    await page.getByRole("button", { name: "Back to automatic" }).click();
    await expect(page.getByTestId("radius-control")).toContainText("(auto)");

    // enlarge
    await page
      .getByRole("button", { name: "Enlarge Signal strength" })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toContainText("Signal strength");
    await page.keyboard.press("Escape");
  });

  test("points table lists, ignores, deletes and exports", async ({ page }) => {
    await gotoTab(page, "points");
    const rows = page.getByTestId("points-row");
    await expect(rows).toHaveCount(24);

    // ignore one point through its switch
    await rows.first().getByRole("switch").click();
    await expect(page.getByTestId("summary-points")).toContainText(
      "23 of 24 enabled",
    );

    // filter
    await page.getByLabel("Filter points").fill("Point_2");
    await expect(rows).toHaveCount(6); // Point_2, Point_20..24
    await page.getByLabel("Filter points").fill("");

    // export
    const download = page.waitForEvent("download");
    await page.getByTestId("export-csv").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/survey-points\.csv$/);
    const text = await (await file.createReadStream()).toArray();
    const csv = Buffer.concat(text).toString("utf8");
    expect(csv.split("\n")[0]).toContain("signal_percent");
    expect(csv.trim().split("\n")).toHaveLength(25);

    // select all on the page and delete
    await page.getByLabel("Select all rows on this page").click();
    await page.getByTestId("delete-selected").click();
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .last()
      .click();
    await expect(rows).toHaveCount(0);
    await expect(page.getByText("No measurements yet")).toBeVisible();

    await readSurvey(page, name, (s) => s.surveyPoints.length === 0);
  });
});
