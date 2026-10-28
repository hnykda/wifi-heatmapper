import { test, expect, Page } from "@playwright/test";
import {
  uploadFloorplan,
  gotoTab,
  measureAt,
  readSurvey,
  useSpeedServer,
} from "./helpers";

/** Open an existing floor plan in a page. */
async function openFloorplan(page: Page, name: string) {
  await page.goto("/#settings");
  await page.getByTestId("floorplan-picker").click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByTestId("summary-floorplan")).toContainText(name);
}

test("two pages adding points to one survey keep both", async ({
  page,
  context,
}) => {
  const name = await uploadFloorplan(page);
  // The second page loads the survey while it is still empty
  const other = await context.newPage();
  await openFloorplan(other, name);
  await expect(other.getByTestId("summary-points")).toContainText("none yet");

  await gotoTab(page, "floorplan");
  await measureAt(page, 0.3, 0.3);
  await readSurvey(page, name, (s) => s.surveyPoints.length === 1);

  // ...and adds its own point without having seen the first one
  await gotoTab(other, "floorplan");
  await measureAt(other, 0.7, 0.7);

  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 2,
  );
  expect(survey.surveyPoints.map((p: { id: string }) => p.id)).toEqual([
    "Point_1",
    "Point_2",
  ]);
  // the second page shows what the server returned: both points
  await expect(other.getByTestId("summary-points")).toContainText("2");
});

test("two pages on one survey both see a measurement's progress", async ({
  page,
  context,
}) => {
  const name = await uploadFloorplan(page);
  // speed tests keep the mock busy for a few seconds
  await useSpeedServer(page, "10.0.0.2");
  await page.getByLabel("Test duration (seconds)").fill("10");
  await readSurvey(page, name, (s) => s.testDuration === 10);
  const other = await context.newPage();
  await openFloorplan(other, name);
  await gotoTab(other, "floorplan");
  await expect(other.getByTestId("floorplan-canvas")).toBeVisible();

  await gotoTab(page, "floorplan");
  await measureAt(page, 0.4, 0.6, { wait: false });

  // the other page follows the same job: progress, then the saved point
  const panel = other.getByTestId("measurement-panel");
  await expect(panel).toHaveAttribute("data-phase", "running");
  await expect(panel).toHaveAttribute("data-mode", "speed");
  await expect(panel).toContainText(/Testing (download|upload) speed/);
  // and can't start a second measurement meanwhile
  await expect(other.getByTestId("floorplan-canvas")).toHaveClass(
    /cursor-progress/,
  );
  await expect(panel).toHaveAttribute("data-phase", "done", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("measurement-panel")).toHaveAttribute(
    "data-phase",
    "done",
  );
  await expect(other.getByTestId("summary-points")).toContainText("1");
  const survey = await readSurvey(
    page,
    name,
    (s) => s.surveyPoints.length === 1,
  );
  expect(
    survey.surveyPoints[0].iperfData.tcpDownload.bitsPerSecond,
  ).toBeGreaterThan(0);
});

test("a change made elsewhere survives the page's next save", async ({
  page,
}) => {
  const name = await uploadFloorplan(page);
  await readSurvey(page, name);
  // another writer (the MCP server, a script) changes a setting
  const res = await page.request.patch(
    `/api/settings?name=${encodeURIComponent(name)}`,
    { data: { testDuration: 7 } },
  );
  expect(res.ok()).toBe(true);
  // the page, which still has the old value, changes something else
  await useSpeedServer(page, "10.0.0.9");
  const survey = await readSurvey(
    page,
    name,
    (s) => s.iperfServerAdrs === "10.0.0.9",
  );
  expect(survey.testDuration).toBe(7);
  // and now shows the other change too
  await expect(page.getByLabel("Test duration (seconds)")).toHaveValue("7");
});
