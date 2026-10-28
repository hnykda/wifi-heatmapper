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

  test("signal-to-noise ratio map renders from points with noise", async ({
    page,
  }) => {
    await gotoTab(page, "heatmaps");
    await expect(page.getByTestId("snr-unavailable")).toHaveCount(0);
    await page.getByLabel("Signal-to-noise ratio", { exact: true }).click();
    const snr = page.getByTestId("heatmap-snr");
    await expect(snr.locator("img")).toBeVisible({ timeout: 30_000 });
    await expect(snr.locator("img")).toHaveAttribute("src", /^data:image\/png/);
    await expect(snr).toContainText("24 points");
    await expect(page.getByTestId("scale-snr")).toContainText(
      "Default: 0–50 dB.",
    );
  });

  test("signal-to-noise ratio is unavailable without noise readings", async ({
    page,
  }) => {
    const survey = await readSurvey(
      page,
      name,
      (s) => s.surveyPoints.length === 24,
    );
    for (const point of survey.surveyPoints) delete point.wifiData.noise;
    const response = await page.request.post("/api/settings", { data: survey });
    expect(response.ok()).toBe(true);
    await page.reload();
    await gotoTab(page, "settings");
    await page.getByTestId("floorplan-picker").click();
    await page.getByRole("menuitem", { name }).click();
    await expect(page.getByTestId("summary-floorplan")).toContainText(name);
    await gotoTab(page, "heatmaps");
    await expect(page.getByTestId("snr-unavailable")).toBeVisible();
    await expect(
      page.getByLabel("Signal-to-noise ratio", { exact: true }),
    ).toBeDisabled();
    await expect(page.getByTestId("heatmap-snr")).toHaveCount(0);
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
    const scale = page.getByTestId("scale-tcpDownload-bitsPerSecond");
    await scale.getByRole("switch").click();
    const seeded = await readSurvey(
      page,
      name,
      (s) => s.heatmapRanges?.["tcpDownload-bitsPerSecond"]?.enabled,
    );
    const maximum = Math.max(
      ...seeded.surveyPoints.map(
        (p: any) => p.iperfData.tcpDownload.bitsPerSecond,
      ),
    );
    expect(seeded.heatmapRanges["tcpDownload-bitsPerSecond"].max).toBe(
      maximum / 1e6,
    );
    expect(await mapPixels()).toBe(original);
    await scale
      .getByLabel("TCP download Throughput (Mbps) lower value")
      .fill("50");
    await scale
      .getByLabel("TCP download Throughput (Mbps) upper value")
      .fill("500");

    await readSurvey(
      page,
      name,
      (s) =>
        s.heatmapRanges?.["tcpDownload-bitsPerSecond"]?.min === 50 &&
        s.heatmapRanges?.["tcpDownload-bitsPerSecond"]?.max === 500,
    );
    await expect.poll(mapPixels).not.toBe(original);

    await scale
      .getByLabel("TCP download Throughput (Mbps) upper value")
      .fill("10");
    await expect(scale.getByRole("alert")).toBeVisible();
    // Wait beyond both the input debounce and settings-save debounce.
    await page.waitForTimeout(800);
    const saved = await readSurvey(page, name);
    expect(saved.heatmapRanges["tcpDownload-bitsPerSecond"]).toEqual({
      min: 50,
      max: 500,
      enabled: true,
    });
    await scale
      .getByLabel("TCP download Throughput (Mbps) upper value")
      .fill("");
    await expect(scale.getByRole("alert")).toBeVisible();
    await page.waitForTimeout(800);
    const afterEmpty = await readSurvey(page, name);
    expect(afterEmpty.heatmapRanges["tcpDownload-bitsPerSecond"]).toEqual({
      min: 50,
      max: 500,
      enabled: true,
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
    await expect(
      scale.getByLabel("TCP download Throughput (Mbps) lower value"),
    ).toHaveValue("50");
    await expect(
      scale.getByLabel("TCP download Throughput (Mbps) upper value"),
    ).toHaveValue("500");
    await scale.getByRole("switch").click();
    await readSurvey(
      page,
      name,
      (s) => s.heatmapRanges?.["tcpDownload-bitsPerSecond"]?.enabled === false,
    );
    await page.reload();
    await gotoTab(page, "settings");
    await page.getByTestId("floorplan-picker").click();
    await page.getByRole("menuitem", { name }).click();
    await expect(page.getByTestId("summary-floorplan")).toContainText(name);
    await gotoTab(page, "heatmaps");
    await page.getByLabel("TCP download", { exact: true }).click();
    await expect(scale.getByRole("switch")).not.toBeChecked();
    await scale.getByRole("switch").click();
    await expect(
      scale.getByLabel("TCP download Throughput (Mbps) lower value"),
    ).toHaveValue("50");
    await expect(
      scale.getByLabel("TCP download Throughput (Mbps) upper value"),
    ).toHaveValue("500");
  });

  test("ranges are independent and only changed maps redraw", async ({
    page,
  }) => {
    await gotoTab(page, "heatmaps");
    await page.getByLabel("TCP download", { exact: true }).click();
    await page.getByLabel("TCP upload", { exact: true }).click();
    for (const key of [
      "signalStrength",
      "tcpDownload-bitsPerSecond",
      "tcpUpload-bitsPerSecond",
    ]) {
      await expect(
        page.getByTestId(`heatmap-${key}`).locator("img"),
      ).toBeVisible({ timeout: 30_000 });
    }
    const tcp = page.getByTestId("scale-tcpDownload-bitsPerSecond");
    const udp = page.getByTestId("scale-tcpUpload-bitsPerSecond");
    await tcp.getByRole("switch").click();
    await udp.getByRole("switch").click();
    // Both controls commit before the debounced survey save.
    await tcp
      .getByLabel("TCP download Throughput (Mbps) upper value")
      .fill("900");
    await udp.getByLabel("TCP upload Throughput (Mbps) upper value").fill("50");
    await readSurvey(
      page,
      name,
      (s) =>
        s.heatmapRanges?.["tcpDownload-bitsPerSecond"]?.max === 900 &&
        s.heatmapRanges?.["tcpUpload-bitsPerSecond"]?.max === 50,
    );
    await expect(page.getByText(/of 24 points used/)).not.toContainText(
      "rendering",
    );

    await page.evaluate(() => {
      let count = 0;
      Object.defineProperty(window, "heatmapRenderCount", { get: () => count });
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value: function (
          this: HTMLCanvasElement,
          type: string,
          ...args: unknown[]
        ) {
          if (type === "webgl") count++;
          return Reflect.apply(original, this, [type, ...args]);
        },
      });
    });
    const upper = tcp.getByLabel("TCP download Throughput (Mbps) upper value");
    await upper.fill("");
    await upper.pressSequentially("500", { delay: 70 });
    expect(
      await page.evaluate(() => Reflect.get(window, "heatmapRenderCount")),
    ).toBe(0);
    await readSurvey(
      page,
      name,
      (s) => s.heatmapRanges?.["tcpDownload-bitsPerSecond"]?.max === 500,
    );
    await expect(page.getByText(/of 24 points used/)).not.toContainText(
      "rendering",
    );
    expect(
      await page.evaluate(() => Reflect.get(window, "heatmapRenderCount")),
    ).toBe(1);
    const survey = await readSurvey(page, name);
    expect(survey.heatmapRanges["tcpUpload-bitsPerSecond"].max).toBe(50);
  });

  test("malformed saved ranges fall back without blanking maps", async ({
    page,
  }) => {
    const survey = await readSurvey(
      page,
      name,
      (s) => s.surveyPoints.length > 0,
    );
    survey.heatmapRanges = {
      signalStrength: { min: 90, max: 10, enabled: true },
      "tcpDownload-bitsPerSecond": { min: 10, max: 10, enabled: true },
      "tcpUpload-bitsPerSecond": { min: "bad", max: 50, enabled: true },
    };
    const response = await page.request.post("/api/settings", { data: survey });
    expect(response.ok()).toBe(true);
    await page.reload();
    await gotoTab(page, "settings");
    await page.getByTestId("floorplan-picker").click();
    await page.getByRole("menuitem", { name }).click();
    await expect(page.getByTestId("summary-floorplan")).toContainText(name);
    await gotoTab(page, "heatmaps");
    await page.getByLabel("TCP download", { exact: true }).click();
    await page.getByLabel("TCP upload", { exact: true }).click();
    for (const key of [
      "signalStrength",
      "tcpDownload-bitsPerSecond",
      "tcpUpload-bitsPerSecond",
    ]) {
      await expect(
        page.getByTestId(`heatmap-${key}`).locator("img"),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByTestId(`scale-${key}`).getByRole("switch"),
      ).not.toBeChecked();
    }
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
    expect(csv.split("\n")[0]).toContain("noise_dbm,snr_db");
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
