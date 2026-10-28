import { test, expect, Page } from "@playwright/test";
import {
  uploadFloorplan,
  gotoTab,
  measureAt,
  readSurvey,
  useSpeedServer,
} from "./helpers";

const ISSUE_PREFIX =
  "https://github.com/hnykda/wifi-heatmapper/issues/new?template=bug_report.yml&";

test("the help menu opens a redacted report and a prefilled issue link", async ({
  page,
}) => {
  const { version } = await (await page.request.get("/api/status")).json();
  const name = await uploadFloorplan(page);
  await useSpeedServer(page, "192.168.77.5");
  await readSurvey(page, name, (s) => s.iperfServerAdrs === "192.168.77.5");

  await page.getByTestId("help-button").click();
  await expect(page.getByTestId("help-docs")).toHaveAttribute(
    "href",
    "https://wifi-heatmapper.danielalder.cz/docs/using-the-app#settings",
  );
  await page.getByTestId("help-report").click();

  const dialog = page.getByTestId("report-dialog");
  await expect(dialog).toContainText("Reports like yours are how we fix it.");
  const preview = page.getByTestId("report-preview");
  await expect(preview).toContainText(`App version: ${version}`);
  await expect(preview).toContainText("Runs as:");
  await expect(preview).toContainText("mock mode");
  await expect(preview).toContainText("Network names and addresses: hidden");
  // the speed test server's address is hidden by default
  await expect(preview).toContainText(
    "Measuring: Signal and speed (server <ip-1>",
  );
  await expect(preview).not.toContainText("192.168.77.5");

  const link = page.getByTestId("report-open-issue");
  const href = (await link.getAttribute("href"))!;
  expect(href.startsWith(ISSUE_PREFIX)).toBe(true);
  expect(href).toContain(`version=${encodeURIComponent(version)}`);
  expect(href).not.toContain("192.168.77.5");
  expect(href.length).toBeLessThanOrEqual(7500);
  await expect(link).toHaveAttribute("target", "_blank");

  // the person can choose to include network details
  await page.getByTestId("report-include-network").click();
  await expect(preview).toContainText("Network names and addresses: included");
  await expect(preview).toContainText("192.168.77.5");

  // closing and reopening hides them again
  await page.keyboard.press("Escape");
  await page.getByTestId("help-button").click();
  await page.getByTestId("help-report").click();
  await expect(preview).toContainText("Network names and addresses: hidden");
});

async function measureInTheMiddle(page: Page) {
  await gotoTab(page, "floorplan");
  const canvas = page.getByTestId("floorplan-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
}

test("a measurement error can be reported from the panel", async ({ page }) => {
  await uploadFloorplan(page);
  // the mock never fails, so make the result an error
  const problem = "Wi-Fi is turned off";
  const jobId = "fake-job";
  await page.route(
    (url) =>
      url.pathname === "/api/start-task" &&
      url.searchParams.get("action") === "start",
    (route) => route.fulfill({ json: { jobId } }),
  );
  await page.route(
    (url) =>
      url.pathname === "/api/start-task" &&
      url.searchParams.get("id") === jobId,
    (route) =>
      route.fulfill({
        json: {
          id: jobId,
          state: "error",
          error: problem,
          progress: {
            type: "done",
            jobId,
            state: "error",
            header: "Error",
            status: problem,
          },
        },
      }),
  );
  await measureInTheMiddle(page);

  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toHaveAttribute("data-phase", "error", {
    timeout: 30_000,
  });
  await expect(panel).toContainText("Could not measure");
  await page.getByTestId("measurement-report").click();

  const preview = page.getByTestId("report-preview");
  await expect(preview).toContainText(`Problem shown: ${problem}`);
  const href = (await page
    .getByTestId("report-open-issue")
    .getAttribute("href"))!;
  const params = new URL(href).searchParams;
  expect(params.get("title")).toBe(`Problem: ${problem}`);
  expect(params.get("what-happened")).toContain(problem);
});

test("a point saved without speed can be reported from the panel", async ({
  page,
}) => {
  await uploadFloorplan(page);
  // "unreachable" makes the mock's speed test server unreachable
  await useSpeedServer(page, "unreachable.example");
  await measureInTheMiddle(page);

  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toHaveAttribute("data-warning", "true", {
    timeout: 30_000,
  });
  await expect(panel).toContainText("Saved without speed");
  await page.getByTestId("measurement-warning-report").click();

  const preview = page.getByTestId("report-preview");
  await expect(preview).toContainText("Problem shown: Saved without speed:");
  await expect(preview).toContainText("Last measurement: worked at");
  await expect(preview).toContainText("Measurement note: Saved without speed:");
  const href = (await page
    .getByTestId("report-open-issue")
    .getAttribute("href"))!;
  expect(new URL(href).searchParams.get("title")).toMatch(
    /^Problem: Saved without speed:/,
  );
});

test("the help button steps aside while the measurement panel is open", async ({
  page,
}) => {
  await uploadFloorplan(page);
  await expect(page.getByTestId("help-button")).toBeVisible();
  await gotoTab(page, "floorplan");
  await measureAt(page, 0.4, 0.4);
  // the panel sits in the same corner and would cover it
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("help-button")).toBeHidden();
  await panel.getByRole("button", { name: "Dismiss" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("help-button")).toBeVisible();
});
