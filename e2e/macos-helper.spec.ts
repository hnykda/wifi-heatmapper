import { test, expect, Page } from "@playwright/test";

/**
 * The macOS Wi-Fi helper panel in Settings. The e2e server runs in mock mode
 * (no helper), so these tests answer /api/status and /api/macos-helper
 * themselves, as a real macOS server with the helper built would.
 */
const HELPER = "/repo/native/macos-wifi-helper/build/WiFiHeatmapperHelper.app";

async function pretendMacWithHelper(
  page: Page,
  helper: Record<string, unknown>,
  afterAuthorize?: Record<string, unknown>,
) {
  await page.route("**/api/status", async (route) => {
    const res = await route.fetch();
    const status = await res.json();
    await route.fulfill({
      json: {
        ...status,
        platform: "darwin",
        mockMode: false,
        docker: false,
        macosHelper: HELPER,
      },
    });
  });
  let current: Record<string, unknown> = {
    available: true,
    path: HELPER,
    ...helper,
  };
  await page.route("**/api/macos-helper", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ action: "authorize" });
      current = { ...current, ...afterAuthorize, prompted: true };
    }
    await route.fulfill({ json: current });
  });
}

test("helper without Location access: no sudo field, offers to allow it", async ({
  page,
}) => {
  await pretendMacWithHelper(
    page,
    {
      locationAuthorized: false,
      locationStatus: "notDetermined",
      locationServicesEnabled: true,
    },
    { locationAuthorized: true, locationStatus: "authorized" },
  );
  await page.goto("/#settings");

  const panel = page.getByTestId("macos-helper-location");
  await expect(panel).toContainText("No sudo password needed here");
  await expect(panel).toContainText("WiFi Heatmapper Helper");
  await expect(page.getByLabel("sudo password")).toHaveCount(0);
  await expect(page.getByTestId("macos-helper-refused")).toHaveCount(0);

  await page.getByTestId("macos-helper-authorize").click();
  await expect(page.getByTestId("macos-helper-ok")).toContainText(
    "network name and access point",
  );
  await expect(panel).toHaveCount(0);
});

test("helper with Location refused: points to System Settings", async ({
  page,
}) => {
  await pretendMacWithHelper(page, {
    locationAuthorized: false,
    locationStatus: "denied",
    locationServicesEnabled: true,
  });
  await page.goto("/#settings");
  await expect(page.getByTestId("macos-helper-refused")).toContainText(
    "Location Services",
  );
  await expect(page.getByTestId("macos-helper-authorize")).toHaveText(
    "Open Location settings",
  );
});

test("helper that does not work: asks for the sudo password", async ({
  page,
}) => {
  await pretendMacWithHelper(page, {
    available: false,
    error: "The macOS Wi-Fi helper failed: timed out after 20 s",
  });
  await page.goto("/#settings");
  await expect(page.getByLabel("sudo password")).toBeVisible();
  await expect(page.getByText(/the Wi-Fi helper did not work/)).toBeVisible();
  await expect(page.getByTestId("macos-helper-location")).toHaveCount(0);
});

test("about dialog names the helper on macOS", async ({ page }) => {
  await pretendMacWithHelper(page, {
    locationAuthorized: true,
    locationStatus: "authorized",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "About Wi-Fi Heatmapper" }).click();
  await expect(page.getByRole("dialog")).toContainText("Wi-Fi helper");
  await expect(page.getByRole("dialog")).toContainText(HELPER);
});

test("mock server never offers the helper", async ({ request }) => {
  const status = await (await request.get("/api/status")).json();
  expect(status.macosHelper).toBeNull();
  const helper = await (await request.get("/api/macos-helper")).json();
  expect(helper.available).toBe(false);
  const post = await request.post("/api/macos-helper", {
    data: { action: "authorize" },
  });
  expect(post.status()).toBe(409);
});
