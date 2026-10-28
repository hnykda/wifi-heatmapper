import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  readSurvey,
  uniqueName,
  uploadFloorplan,
  useSpeedServer,
} from "./helpers";

test("a second floor plan starts with the speed settings of the first", async ({
  page,
}) => {
  const first = await uploadFloorplan(page);
  await useSpeedServer(page, "192.168.5.5:5201");
  await page.getByLabel("Test duration (seconds)").fill("4");
  await readSurvey(
    page,
    first,
    (s) => s.iperfServerAdrs === "192.168.5.5:5201" && s.testDuration === 4,
  );

  const second = await uploadFloorplan(page);
  await expect(page.getByTestId("speed-settings-copied")).toHaveText(
    `Speed settings copied from ${first}.`,
  );
  await expect(page.getByLabel("Signal and speed")).toBeChecked();
  await expect(page.getByLabel("Speed test server (uses iperf3)")).toHaveValue(
    "192.168.5.5:5201",
  );
  await expect(page.getByLabel("Test duration (seconds)")).toHaveValue("4");
  const survey = await readSurvey(page, second);
  expect(survey).toMatchObject({
    measureSpeed: true,
    iperfServerAdrs: "192.168.5.5:5201",
    testDuration: 4,
    surveyPoints: [],
  });

  // said once, right after the survey was created
  await page.reload();
  await page.getByTestId("floorplan-picker").click();
  await page.getByRole("menuitem", { name: second }).click();
  await expect(page.getByTestId("summary-floorplan")).toContainText(second);
  await expect(page.getByLabel("Signal and speed")).toBeChecked();
  await expect(page.getByTestId("speed-settings-copied")).toHaveCount(0);
});

/**
 * A survey with speed, access point names and its own heat map look,
 * written through the API after the open one, so that one doesn't start
 * with its speed settings.
 */
async function sourceSurvey(page: Page): Promise<string> {
  const name = uniqueName("source");
  const res = await page.request.patch(
    `/api/settings?name=${encodeURIComponent(name)}`,
    {
      data: {
        measureSpeed: true,
        iperfServerAdrs: "10.1.2.3",
        testDuration: 6,
        apMapping: [{ apName: "Hallway AP", macAddress: "aabbccddeeff" }],
        maxOpacity: 0.4,
        heatmapRanges: { signalStrength: { min: 20, max: 80, enabled: true } },
      },
    },
  );
  expect(res.ok()).toBe(true);
  return name;
}

/** Copy settings from `from` into the current survey with only `part` ticked. */
async function copyOnly(
  page: Page,
  from: string,
  part: "speed" | "apNames" | "heatmapLook",
) {
  await page.getByTestId("copy-settings-open").click();
  const dialog = page.getByTestId("copy-settings-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("copy-settings-source").selectOption(from);
  // speed settings are ticked to start with, the rest are not
  await expect(page.getByTestId("copy-part-speed")).toBeChecked();
  await expect(page.getByTestId("copy-part-apNames")).not.toBeChecked();
  await expect(page.getByTestId("copy-part-heatmapLook")).not.toBeChecked();
  if (part !== "speed") {
    await page.getByTestId("copy-part-speed").click();
    await page.getByTestId(`copy-part-${part}`).click();
  }
  await page.getByTestId("copy-settings-confirm").click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Settings copied", { exact: true }).first(),
  ).toBeVisible();
}

test("copy settings from: speed settings", async ({ page }) => {
  const to = await uploadFloorplan(page);
  const from = await sourceSurvey(page);
  await expect(page.getByLabel("Signal only")).toBeChecked();
  await copyOnly(page, from, "speed");

  await expect(page.getByLabel("Signal and speed")).toBeChecked();
  await expect(page.getByLabel("Speed test server (uses iperf3)")).toHaveValue(
    "10.1.2.3",
  );
  await expect(page.getByLabel("Test duration (seconds)")).toHaveValue("6");
  const survey = await readSurvey(page, to, (s) => s.measureSpeed === true);
  expect(survey).toMatchObject({
    iperfServerAdrs: "10.1.2.3",
    testDuration: 6,
    apMapping: [],
    maxOpacity: 0.7,
    heatmapRanges: {},
    floorplanImageName: to,
  });
});

test("copy settings from: access point names", async ({ page }) => {
  const to = await uploadFloorplan(page);
  const from = await sourceSurvey(page);
  await copyOnly(page, from, "apNames");

  await expect(
    page.getByTestId("ap-mapping").locator("input").first(),
  ).toHaveValue("Hallway AP");
  await expect(page.getByLabel("Signal only")).toBeChecked();
  const survey = await readSurvey(page, to, (s) => s.apMapping.length === 1);
  expect(survey).toMatchObject({
    apMapping: [{ apName: "Hallway AP", macAddress: "aabbccddeeff" }],
    measureSpeed: false,
    maxOpacity: 0.7,
  });
});

test("copy settings from: heat map look", async ({ page }) => {
  const to = await uploadFloorplan(page);
  const from = await sourceSurvey(page);
  await copyOnly(page, from, "heatmapLook");

  await expect(page.getByLabel("Opacity at strongest")).toHaveValue("0.4");
  await expect(page.getByLabel("Signal only")).toBeChecked();
  const survey = await readSurvey(page, to, (s) => s.maxOpacity === 0.4);
  expect(survey).toMatchObject({
    heatmapRanges: { signalStrength: { min: 20, max: 80, enabled: true } },
    apMapping: [],
    measureSpeed: false,
    surveyPoints: [],
  });
});
