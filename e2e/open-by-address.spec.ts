import { test, expect } from "./fixtures";

// People open the app by this computer's LAN address, not only localhost
// (#140). `next dev` refuses its scripts to pages from any host but
// localhost unless next.config.mjs allows it (allowedDevOrigins), and then
// the page renders but never becomes interactive. 127.0.0.1 stands in for
// a LAN address: it is not "localhost" to Next either. CI runs this spec
// against `next dev` too (E2E_SERVER=dev in ci.yaml), since `next start`
// has no such check.
test("the app works when opened by IP address", async ({ page, baseURL }) => {
  const url = new URL(baseURL!);
  url.hostname = "127.0.0.1";
  await page.goto(url.href);
  await page.getByTestId("tab-heatmaps").click();
  await expect(page).toHaveURL(/#heatmaps$/);
  await expect(page.getByTestId("tab-heatmaps")).toHaveAttribute(
    "data-state",
    "active",
  );
});
