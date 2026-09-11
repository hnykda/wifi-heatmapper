import { test, expect } from "@playwright/test";

test("server reports mock mode and a version", async ({ request }) => {
  const res = await request.get("/api/status");
  expect(res.ok()).toBeTruthy();
  const status = await res.json();
  expect(status.mockMode).toBe(true);
  expect(status.version).toMatch(/^\d+\.\d+\.\d+/);
  expect(["darwin", "win32", "linux"]).toContain(status.platform);
});

test("the app loads with its four sections", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Wi-Fi Heatmapper/);
  for (const id of ["settings", "floorplan", "heatmaps", "points"]) {
    await expect(page.getByTestId(`tab-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("mock-badge")).toBeVisible();
  await expect(page.getByTestId("summary-floorplan")).toContainText(".png");
});

test("the active tab survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-heatmaps").click();
  await expect(page).toHaveURL(/#heatmaps$/);
  await page.reload();
  await expect(page.getByTestId("tab-heatmaps")).toHaveAttribute(
    "data-state",
    "active",
  );
});

test("about dialog shows what is running", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "About Wi-Fi Heatmapper" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Version");
  await expect(dialog).toContainText("mock (synthetic)");
});

test("theme toggle switches to dark and is remembered", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await page.getByTestId("theme-toggle").click();
  await expect(html).not.toHaveClass(/dark/);
});
