import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// Survey data directory - mapped from Docker volume
const SURVEY_DIR = process.env.CI ? "/data/surveys" : "./data/surveys";
const TEST_FLOORPLAN = "EmptyFloorPlan.png";

test.describe("WiFi Heatmap Integration Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("app loads and displays settings tab", async ({ page }) => {
    // Check that the Settings tab is visible and active by default
    await expect(page.getByRole("tab", { name: "Settings" })).toBeVisible();
    await expect(page.getByLabel("iperfServer")).toBeVisible();
  });

  test("can navigate to Floor Plan tab and see canvas", async ({ page }) => {
    // Click on Floor Plan tab
    await page.getByRole("tab", { name: "Floor Plan" }).click();

    // Wait for canvas to be visible
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Verify canvas has reasonable dimensions
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test("full measurement flow: click canvas and verify data saved", async ({
    page,
  }) => {
    // Step 1: Configure iperf server address
    const iperfInput = page.locator('input[type="text"]').first();
    await iperfInput.clear();
    await iperfInput.fill("iperf3-server");

    // Step 2: Navigate to Floor Plan tab
    await page.getByRole("tab", { name: "Floor Plan" }).click();

    // Wait for canvas
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Step 3: Click on the canvas to trigger measurement
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Click at center of canvas
    const clickX = box!.x + box!.width / 2;
    const clickY = box!.y + box!.height / 2;
    await page.mouse.click(clickX, clickY);

    // Step 4: Wait for measurement to start (toast/dialog appears)
    // The NewToast component shows measurement progress
    await expect(
      page.getByText(/Measurement|Measuring|in progress/i),
    ).toBeVisible({ timeout: 15_000 });

    // Step 5: Wait for measurement to complete
    // This can take a while because iperf runs 4 tests (TCP up/down, UDP up/down)
    await expect(page.getByText(/complete|done/i)).toBeVisible({
      timeout: 90_000,
    });

    // Give it a moment for data to persist
    await page.waitForTimeout(2_000);

    // Step 6: Verify the survey JSON file was created with data
    const surveyPath = path.join(SURVEY_DIR, `${TEST_FLOORPLAN}.json`);

    // Read and verify the file
    expect(fs.existsSync(surveyPath)).toBe(true);

    const surveyData = JSON.parse(fs.readFileSync(surveyPath, "utf-8"));
    expect(surveyData.surveyPoints).toBeDefined();
    expect(surveyData.surveyPoints.length).toBeGreaterThanOrEqual(1);

    // Verify the survey point has the expected structure
    const point = surveyData.surveyPoints[0];
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
    expect(point.wifiData).toBeDefined();
    expect(point.iperfData).toBeDefined();

    // Verify WiFi data from mock (signal strength 75%, SSID MockNetwork)
    expect(point.wifiData.ssid).toBe("MockNetwork");
    expect(point.wifiData.signalStrength).toBe(75);

    // Verify iperf data exists (real iperf tests ran)
    expect(point.iperfData.tcpDownload).toBeDefined();
    expect(point.iperfData.tcpUpload).toBeDefined();
    expect(point.iperfData.tcpDownload.bitsPerSecond).toBeGreaterThan(0);
  });

  test("can cancel measurement in progress", async ({ page }) => {
    // Configure iperf server
    const iperfInput = page.locator('input[type="text"]').first();
    await iperfInput.clear();
    await iperfInput.fill("iperf3-server");

    // Go to Floor Plan
    await page.getByRole("tab", { name: "Floor Plan" }).click();
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Click to start measurement
    const box = await canvas.boundingBox();
    await page.mouse.click(box!.x + 100, box!.y + 100);

    // Wait for measurement to start
    await expect(
      page.getByText(/Measurement|Measuring|in progress/i),
    ).toBeVisible({ timeout: 15_000 });

    // Click cancel button
    const cancelButton = page.getByRole("button", { name: /cancel/i });
    if (await cancelButton.isVisible()) {
      await cancelButton.click();

      // Verify cancellation feedback
      await expect(page.getByText(/cancel/i)).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("API Integration Tests", () => {
  test("settings API returns survey list", async ({ request }) => {
    const response = await request.get("/api/settings?list=true");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty("surveys");
    expect(Array.isArray(data.surveys)).toBe(true);
  });

  test("media API returns floorplan list", async ({ request }) => {
    const response = await request.get("/api/media");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty("images");
    expect(Array.isArray(data.images)).toBe(true);
    // Should have at least the default EmptyFloorPlan
    expect(data.images.length).toBeGreaterThanOrEqual(1);
  });
});
