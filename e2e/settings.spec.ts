import { test, expect } from "@playwright/test";
import {
  uploadFloorplan,
  readSurvey,
  makePng,
  useSpeedServer,
} from "./helpers";

test("uploading a floor plan creates its own survey file", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await expect(page.getByTestId("floorplan-preview")).toBeVisible();

  const survey = await readSurvey(
    page,
    name,
    (s) => s.floorplanImageName === name,
  );
  expect(survey.surveyPoints).toEqual([]);
  expect(survey.meta.appVersion).toMatch(/^\d+\.\d+\.\d+/);
  expect(survey.meta.platform).toBeTruthy();
  expect(survey.sudoerPassword).toBeUndefined();

  // the image is served by the API, not from /public
  const img = await page.request.get(`/api/media/${encodeURIComponent(name)}`);
  expect(img.ok()).toBeTruthy();
  expect(img.headers()["content-type"]).toBe("image/png");
});

test("uploading a duplicate name is refused", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await page.getByTestId("floorplan-file-input").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: makePng(100, 100),
  });
  // exact/first: Radix also copies the toast into a screen-reader-only
  // role="status" span, which sometimes matches too.
  await expect(page.getByText("Upload failed", { exact: true })).toBeVisible();
  await expect(page.getByText(/already exists/).first()).toBeVisible();
});

test("settings persist across reloads", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await useSpeedServer(page, "192.168.1.10:5201");
  await page.getByLabel("Test duration (seconds)").fill("3");
  await expect(page.getByTestId("summary-iperf")).toContainText(
    "192.168.1.10:5201",
  );

  // the debounced save has to land before we leave
  await readSurvey(
    page,
    name,
    (s) => s.testDuration === 3 && s.measureSpeed === true,
  );

  await page.reload();
  // the app opens the default floor plan; switch back to ours
  await page.getByTestId("floorplan-picker").click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByLabel("Signal and speed")).toBeChecked();
  await expect(page.getByLabel("Speed test server (uses iperf3)")).toHaveValue(
    "192.168.1.10:5201",
  );
  await expect(page.getByLabel("Test duration (seconds)")).toHaveValue("3");
});

test("signal only hides the speed settings", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await expect(page.getByLabel("Signal only")).toBeChecked();
  await expect(page.getByLabel("Speed test server (uses iperf3)")).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Test duration (seconds)")).toHaveCount(0);
  await expect(page.getByTestId("speed-checklist")).toHaveCount(0);
  await page.getByTestId("measure-mode-speed").click();
  await expect(page.getByTestId("speed-checklist")).toBeVisible();
  // the iperf3 commands are tucked away under Advanced
  await expect(page.getByLabel("Download (TCP)")).toHaveCount(0);
  await page.getByTestId("iperf-commands-toggle").click();
  await expect(page.getByLabel("Download (TCP)")).toBeVisible();
  await readSurvey(page, name, (s) => s.measureSpeed === true);
});

test("test connection checks the speed test server", async ({ page }) => {
  await uploadFloorplan(page);
  await useSpeedServer(page, "unreachable.local");
  await expect(page.getByTestId("check-iperf3")).toHaveAttribute(
    "data-state",
    "ok",
  );
  await expect(page.getByTestId("check-server")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  await page.getByTestId("speed-test-connection").click();
  await expect(page.getByTestId("check-server")).toHaveAttribute(
    "data-state",
    "bad",
  );
  await expect(page.getByTestId("check-server")).toContainText(
    "Can't reach the speed test server",
  );
  await page
    .getByLabel("Speed test server (uses iperf3)")
    .fill("[fe80::1]:5202");
  await page.getByTestId("speed-test-connection").click();
  await expect(page.getByTestId("check-server")).toHaveAttribute(
    "data-state",
    "ok",
  );
});

test("an old survey with a server opens as signal and speed", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  const survey = await readSurvey(page, name);
  delete survey.measureSpeed;
  survey.iperfServerAdrs = "10.0.0.2";
  const res = await page.request.post("/api/settings", { data: survey });
  expect(res.ok()).toBe(true);
  await page.reload();
  await page.getByTestId("floorplan-picker").click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByTestId("summary-floorplan")).toContainText(name);
  await expect(page.getByLabel("Signal and speed")).toBeChecked();
  await expect(page.getByTestId("summary-iperf")).toContainText(
    "Signal and speed (10.0.0.2)",
  );
});

test("deleting a floor plan removes it and its survey", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await page.getByTestId("floorplan-delete").click();
  await page.getByRole("button", { name: "Delete floor plan" }).click();
  await expect(page.getByTestId("summary-floorplan")).toContainText(
    "EmptyFloorPlan.png",
  );
  const res = await page.request.get(
    `/api/settings?name=${encodeURIComponent(name)}`,
  );
  expect(res.status()).toBe(404);
  const img = await page.request.get(`/api/media/${encodeURIComponent(name)}`);
  expect(img.status()).toBe(404);
});

test("access point names are validated and saved", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await page.getByRole("button", { name: "Add access point" }).click();
  await page.getByLabel("Access point name").fill("Living room");
  await page.getByLabel("MAC address").fill("not a mac");
  await page.getByLabel("MAC address").blur();
  await expect(page.getByText(/12 hex digits/)).toBeVisible();

  await page.getByLabel("MAC address").fill("9E:05:D6:96:E8:30");
  await page.getByLabel("MAC address").blur();
  await expect(page.getByText(/12 hex digits/)).toHaveCount(0);
  const survey = await readSurvey(page, name, (s) => s.apMapping?.length === 1);
  expect(survey.apMapping).toEqual([
    { apName: "Living room", macAddress: "9e05d696e830" },
  ]);
});

test("access point names accept a prefix ending in *", async ({ page }) => {
  const name = await uploadFloorplan(page);
  await page.getByRole("button", { name: "Add access point" }).click();
  await page.getByLabel("Access point name").fill("Upstairs");
  await page.getByLabel("MAC address").fill("9e:05:d6:96:e8:*");
  await page.getByLabel("MAC address").blur();
  await expect(page.getByText(/12 hex digits/)).toHaveCount(0);
  await expect(page.getByLabel("MAC address")).toHaveValue("9E-05-D6-96-E8-*");
  const survey = await readSurvey(page, name, (s) => s.apMapping?.length === 1);
  expect(survey.apMapping).toEqual([
    { apName: "Upstairs", macAddress: "9e05d696e8*" },
  ]);
});

test("media API rejects path traversal", async ({ request }) => {
  const res = await request.get("/api/media/..%2Fpackage.json");
  expect([400, 404]).toContain(res.status());
  const res2 = await request.get("/api/media/.hidden.png");
  expect([400, 404]).toContain(res2.status());
});
