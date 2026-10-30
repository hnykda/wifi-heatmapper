/**
 * What the app does when measuring goes wrong, with the mock backend told
 * how to misbehave (the `mock` fixture, see fixtures.ts). Everything above
 * the mock scanner and the mock iperf3 is the real code: the preflight,
 * speed test planning, the measurement job, saving, diagnostics.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  gotoTab,
  readSurvey,
  uploadFloorplan,
  useSpeedServer,
} from "./helpers";
import { AppClient } from "../src/mcp/app-client";
import {
  describeJob,
  measurementSettings,
  SUDO_NEEDED,
  SUDO_WRONG,
  waitForJob,
} from "../src/mcp/measure";

/** Click the floor plan and wait until the measurement has ended. */
async function measureUntil(
  page: Page,
  phase: "done" | "error",
  fx = 0.5,
  fy = 0.5,
) {
  await gotoTab(page, "floorplan");
  const panel = page.getByTestId("measurement-panel");
  // a panel left from an earlier measurement goes first
  if (await panel.isVisible()) {
    await panel
      .getByRole("button", { name: "Dismiss" })
      .click({ timeout: 2000 })
      .catch(() => {}); // a saved one may close itself first
  }
  await expect(panel).toHaveCount(0);
  // not measureAt: a measurement that fails at once is never "running"
  const canvas = page.getByTestId("floorplan-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  await expect(panel).toHaveAttribute("data-phase", phase, { timeout: 30_000 });
  return panel;
}

/** Start a measurement the way the MCP server does, and wait for its end. */
async function measureLikeMcp(page: Page, baseURL: string, survey: string) {
  const client = new AppClient({ baseUrl: new URL(baseURL) });
  const stored = await client.survey(survey);
  expect(stored).not.toBeNull();
  const answer = await client.startMeasurement(
    survey,
    100,
    100,
    measurementSettings(stored!),
  );
  expect(answer.started).toBe(true);
  if (!answer.started) throw new Error("not started");
  const job = await waitForJob(client, answer.job.id, {
    timeoutMs: 30_000,
    pollMs: 200,
  });
  return describeJob(client, job!);
}

/** Type the sudo password in Settings and wait until the server holds it. */
async function enterSudoPassword(page: Page, password: string) {
  await gotoTab(page, "settings");
  await page.getByLabel("sudo password").fill(password);
  await expect
    .poll(async () => (await page.request.get("/api/sudo-password")).json())
    .toEqual({ held: true });
}

test("sudo password needed: Settings asks for it, the panel and MCP say so", async ({
  page,
  mock,
  baseURL,
}) => {
  await mock.set({ wifi: "needs-sudo", sudoPassword: "letmein" });
  const name = await uploadFloorplan(page);
  await expect(page.getByLabel("sudo password")).toBeVisible();
  await expect(page.getByTestId("sudo-not-needed")).toHaveCount(0);

  const panel = await measureUntil(page, "error");
  await expect(panel).toContainText("Could not measure");
  await expect(panel).toContainText("Please set sudo password");

  // an AI agent gets the plain message, and is told not to ask in chat
  const mcp = await measureLikeMcp(page, baseURL!, name);
  expect(mcp.isError).toBe(true);
  expect(mcp.value).toMatchObject({
    state: "error",
    reason: SUDO_NEEDED,
    sudoPasswordNeeded: true,
  });

  // typed in Settings: the page's measurements and the agent's work
  await enterSudoPassword(page, "letmein");
  await measureUntil(page, "done", 0.3, 0.3);
  const after = await measureLikeMcp(page, baseURL!, name);
  expect(after.isError).toBe(false);
  expect(after.value).toMatchObject({ state: "done" });
  await readSurvey(page, name, (s) => s.surveyPoints.length === 2);
  // never written to the survey file
  const file = await readSurvey(page, name);
  expect(JSON.stringify(file)).not.toContain("letmein");
});

test("a wrong sudo password is refused, with a plain message", async ({
  page,
  mock,
  baseURL,
}) => {
  await mock.set({ wifi: "wrong-sudo" });
  const name = await uploadFloorplan(page);
  await enterSudoPassword(page, "not-it");
  const panel = await measureUntil(page, "error");
  await expect(panel).toContainText("Please enter a valid sudo password.");

  const mcp = await measureLikeMcp(page, baseURL!, name);
  expect(mcp.value).toMatchObject({
    reason: SUDO_WRONG,
    sudoPasswordNeeded: true,
  });
  const survey = await readSurvey(page, name);
  expect(survey.surveyPoints).toHaveLength(0);
});

test("Wi-Fi off: nothing is saved and the panel says why", async ({
  page,
  mock,
}) => {
  await mock.set({ wifi: "not-connected" });
  const name = await uploadFloorplan(page);
  const panel = await measureUntil(page, "error");
  await expect(panel).toContainText("Wi-Fi is not connected");
  const survey = await readSurvey(page, name);
  expect(survey.surveyPoints).toHaveLength(0);
});

test("iperf3 missing: the signal is saved without speed", async ({
  page,
  mock,
}) => {
  await mock.set({ iperf: "missing" });
  const name = await uploadFloorplan(page);
  await useSpeedServer(page, "10.0.0.2");
  // the checklist already knows
  await expect(page.getByTestId("check-iperf3")).toHaveAttribute(
    "data-state",
    "bad",
  );

  const panel = await measureUntil(page, "done");
  await expect(panel).toHaveAttribute("data-warning", "true");
  await expect(panel).toContainText("Saved without speed");
  await expect(page.getByTestId("measurement-warning")).toContainText(
    "iperf3 is not installed on this computer",
  );
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  const point = survey.surveyPoints[0];
  expect(point.wifiData.signalStrength).toBeGreaterThan(0);
  expect(point.iperfData.tcpDownload).toBeNull();
  expect(point.iperfData.udpUpload).toBeNull();
});

test("speed test server unreachable: the signal is saved without speed", async ({
  page,
  mock,
}) => {
  await mock.set({ iperf: "unreachable" });
  const name = await uploadFloorplan(page);
  await useSpeedServer(page, "192.168.1.20:5202");
  const panel = await measureUntil(page, "done");
  await expect(panel).toContainText("Saved without speed");
  await expect(page.getByTestId("measurement-warning")).toContainText(
    "Can't reach the speed test server at 192.168.1.20:5202",
  );
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  expect(survey.surveyPoints[0].iperfData.tcpDownload).toBeNull();
});

test("iperf3 failing midway: what was measured is kept, with a warning", async ({
  page,
  mock,
}) => {
  await mock.set({ iperf: "fails-midway" });
  const name = await uploadFloorplan(page);
  await useSpeedServer(page, "10.0.0.2");
  const panel = await measureUntil(page, "done");
  await expect(panel).toContainText("Saved without speed");
  await expect(page.getByTestId("measurement-warning")).toContainText(
    "The speed test failed (the server is busy running a test. try again later). The signal reading was saved without speed.",
  );
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  const { iperfData, wifiData } = survey.surveyPoints[0];
  // the download ran, the upload failed, the rest was skipped: not measured
  expect(iperfData.tcpDownload.bitsPerSecond).toBeGreaterThan(0);
  expect(iperfData.tcpUpload).toBeNull();
  expect(iperfData.udpDownload).toBeNull();
  expect(iperfData.udpUpload).toBeNull();
  expect(wifiData.signalStrength).toBeGreaterThan(0);

  // the table shows the download and "—" for the tests that did not run,
  // never 0 Mbps
  const download = (iperfData.tcpDownload.bitsPerSecond / 1e6).toFixed(2);
  await gotoTab(page, "points");
  const table = page.getByTestId("points-table");
  const row = page.getByTestId("points-row");
  await expect(row).toHaveCount(1);
  const header = await table.locator("thead th").allInnerTexts();
  const cells = await row.locator("td").allInnerTexts();
  const cell = (name: string) => cells[header.indexOf(name)]?.trim();
  expect(cell("Download Mbps")).toBe(download);
  expect(cell("Upload Mbps")).toBe("—");

  // the CSV leaves the cells of the tests that did not run empty
  const file = page.waitForEvent("download");
  await page.getByTestId("export-csv").click();
  const csv = Buffer.concat(
    await (await (await file).createReadStream()).toArray(),
  ).toString("utf8");
  const [head, line] = csv.trim().split("\n");
  const cols = head.split(",");
  const values = line.split(",");
  const csvCell = (name: string) => values[cols.indexOf(name)];
  expect(Number(csvCell("tcp_download_mbps"))).toBeCloseTo(Number(download), 2);
  expect(csvCell("tcp_upload_mbps")).toBe("");
  expect(csvCell("udp_download_mbps")).toBe("");
  expect(csvCell("udp_upload_mbps")).toBe("");
});

test("the WLAN API failing is one clear error, and the report has it", async ({
  page,
  mock,
}) => {
  await mock.set({ wifiMethod: "wlan-api-error" });
  await uploadFloorplan(page);
  const panel = await measureUntil(page, "error");
  await expect(panel).toContainText(
    "Can't read Wi-Fi through the Windows WLAN API (koffi could not load wlanapi.dll: Cannot find module 'koffi')",
  );
  await expect(panel).toContainText("Report a problem");
  await panel.getByTestId("measurement-report").click();
  const preview = page.getByTestId("report-preview");
  await expect(preview).toContainText(
    "Wi-Fi reading: Windows WLAN API (connection query failed: koffi could not load wlanapi.dll: Cannot find module 'koffi')",
  );
  const report = await (await page.request.get("/api/diagnostics")).json();
  expect(report.wifiMethod).toContain("Windows WLAN API");
  expect(report.wifiMethod).toContain("koffi could not load wlanapi.dll");
  expect(report.wifiMethod).not.toContain("netsh");
});

test("no noise reading: the point has none and the SNR map is off", async ({
  page,
  mock,
}) => {
  await mock.set({ noise: null, signal: 64 });
  const name = await uploadFloorplan(page);
  await measureUntil(page, "done", 0.3, 0.3);
  await measureUntil(page, "done", 0.7, 0.6);
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 2,
  );
  for (const point of survey.surveyPoints) {
    expect(point.wifiData.noise ?? null).toBeNull();
    expect(point.wifiData.signalStrength).toBe(64);
  }
  await gotoTab(page, "heatmaps");
  await expect(
    page.getByTestId("heatmap-signalStrength").locator("img"),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("snr-unavailable")).toBeVisible();
  await expect(
    page.getByLabel("Signal-to-noise ratio", { exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("heatmap-snr")).toHaveCount(0);
});

test("the scenario API refuses what it doesn't know", async ({ request }) => {
  const bad = await request.put("/api/e2e/scenario", {
    data: { wifi: "on fire" },
  });
  expect(bad.status()).toBe(400);
  const unknown = await request.put("/api/e2e/scenario", {
    data: { colour: "blue" },
  });
  expect(unknown.status()).toBe(400);
  expect(await (await request.get("/api/e2e/scenario")).json()).toEqual({});
});

test("each test starts from the seeded data", async ({ request }) => {
  const { surveys } = await (
    await request.get("/api/settings?list=true")
  ).json();
  // at most the default floor plan's survey, made when a page opens it
  expect(surveys.filter((s: string) => s !== "EmptyFloorPlan.png")).toEqual([]);
  const { files } = await (await request.get("/api/media")).json();
  expect(files).toEqual(["EmptyFloorPlan.png", "House & Garage.jpg"]);
});
