import { test, expect } from "./fixtures";
import { gotoTab, measureAt, uploadFloorplan } from "./helpers";

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

test("opens on the floor plan, Settings last", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("tab-floorplan")).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByTestId("floorplan-canvas")).toBeVisible();
  const tabs = await page.getByRole("tab").allInnerTexts();
  expect(tabs.at(-1)).toBe("Settings");
});

test("a hint on the plan says what to do next", async ({ page }) => {
  await uploadFloorplan(page);
  await gotoTab(page, "floorplan");
  const hint = page.getByTestId("next-step-hint");
  await expect(hint).toHaveAttribute("data-step", "1");
  await expect(hint).toContainText("Click where you are standing");

  await measureAt(page, 0.3, 0.3);
  await expect(hint).toHaveAttribute("data-step", "2");
  await expect(hint).toContainText("another room");

  await measureAt(page, 0.5, 0.5);
  await measureAt(page, 0.7, 0.7);
  await expect(hint).toHaveAttribute("data-step", "3");
  await page.getByTestId("next-step-heatmaps").click();
  await expect(page.getByTestId("tab-heatmaps")).toHaveAttribute(
    "data-state",
    "active",
  );

  // a survey with enough points shows no hint
  await page.getByTestId("tab-floorplan").click();
  await page.getByTestId("add-sample-points").click();
  await expect(page.getByTestId("summary-points")).toContainText("27");
  await expect(hint).toHaveCount(0);
});
