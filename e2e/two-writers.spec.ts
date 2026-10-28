import { test, expect, Page } from "@playwright/test";
import { uploadFloorplan, gotoTab, measureAt, readSurvey } from "./helpers";

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
  await page.getByLabel("iperf3 server").fill("10.0.0.9");
  const survey = await readSurvey(
    page,
    name,
    (s) => s.iperfServerAdrs === "10.0.0.9",
  );
  expect(survey.testDuration).toBe(7);
  // and now shows the other change too
  await expect(page.getByLabel("Test duration (seconds)")).toHaveValue("7");
});
