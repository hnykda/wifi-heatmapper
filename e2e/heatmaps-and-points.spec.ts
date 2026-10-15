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

  test("fixed colour ranges update maps, validate and survive reload", async ({
    page,
  }) => {
    await gotoTab(page, "heatmaps");
    await page.getByLabel("TCP download", { exact: true }).click();
    const image = page
      .getByTestId("heatmap-tcpDownload-bitsPerSecond")
      .locator("img");
    await expect(image).toBeVisible({ timeout: 30_000 });
    // Compare only the floor plan interior, not the legend or caption.
    const mapPixels = () =>
      image.evaluate(async (element) => {
        const img = element as HTMLImageElement;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 300;
        canvas
          .getContext("2d")!
          .drawImage(img, 100, 100, 600, 300, 0, 0, 600, 300);
        return canvas.toDataURL();
      });
    const original = await mapPixels();
    const scale = page.getByTestId("scale-bitsPerSecond");
    await scale.getByRole("switch").click();
    await scale.getByLabel("Throughput (Mbps) lower value").fill("1001");
    await scale.getByRole("switch").click();
    await scale.getByRole("switch").click();
    await expect(scale.getByLabel("Throughput (Mbps) lower value")).toHaveValue(
      "0",
    );
    await scale.getByLabel("Throughput (Mbps) lower value").fill("50");
    await scale.getByLabel("Throughput (Mbps) upper value").fill("500");

    await readSurvey(
      page,
      name,
      (s) =>
        s.heatmapRanges?.bitsPerSecond?.min === 50 &&
        s.heatmapRanges?.bitsPerSecond?.max === 500,
    );
    await expect.poll(mapPixels).not.toBe(original);

    await scale.getByLabel("Throughput (Mbps) upper value").fill("10");
    await expect(scale.getByRole("alert")).toBeVisible();
    // Wait beyond both the input debounce and settings-save debounce.
    await page.waitForTimeout(800);
    const saved = await readSurvey(page, name);
    expect(saved.heatmapRanges.bitsPerSecond).toEqual({ min: 50, max: 500 });
    await scale.getByLabel("Throughput (Mbps) upper value").fill("");
    await expect(scale.getByRole("alert")).toBeVisible();
    await page.waitForTimeout(800);
    const afterEmpty = await readSurvey(page, name);
    expect(afterEmpty.heatmapRanges.bitsPerSecond).toEqual({
      min: 50,
      max: 500,
    });
    await page.reload();
    // Reload opens the default survey; explicitly reopen the saved one.
    await gotoTab(page, "settings");
    await page.getByTestId("floorplan-picker").click();
    await page.getByRole("menuitem", { name }).click();
    await expect(page.getByTestId("summary-floorplan")).toContainText(name);
    await gotoTab(page, "heatmaps");
    await page.getByLabel("TCP download", { exact: true }).click();
    await expect(scale.getByRole("switch")).toBeChecked();
    await expect(scale.getByLabel("Throughput (Mbps) lower value")).toHaveValue(
      "50",
    );
    await expect(scale.getByLabel("Throughput (Mbps) upper value")).toHaveValue(
      "500",
    );
    await scale.getByRole("switch").click();
    await readSurvey(page, name, (s) => !s.heatmapRanges?.bitsPerSecond);
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
