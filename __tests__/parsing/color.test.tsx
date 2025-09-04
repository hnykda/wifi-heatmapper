import { expect, test, beforeAll } from "vitest";
import { getColorAt } from "../../src/lib/utils";
import { getDefaults } from "../../src/components/GlobalSettings";
import { HeatmapSettings } from "../../src/lib/types";

beforeAll(() => {
  settings = getDefaults("EmptyFloorPlan.png");
});

let settings: HeatmapSettings;

test("Specific color value: -0.1", () => {
  expect(getColorAt(-0.1, settings.gradient)).toStrictEqual(
    "rgba(255, 0, 0, 0.60)",
  );
});

test("Specific color value: 0.0", () => {
  expect(getColorAt(0.0, settings.gradient)).toStrictEqual(
    "rgba(255, 0, 0, 0.60)",
  );
});
test("Specific color value: 0.25", () => {
  expect(getColorAt(0.25, settings.gradient)).toStrictEqual(
    "rgba(255, 142, 0, 0.60)",
  );
});

test("Specific color value: 0.50", () => {
  expect(getColorAt(0.5, settings.gradient)).toStrictEqual(
    "rgba(0, 0, 255, 0.60)",
  );
});

test("Specific color value: 0.75", () => {
  expect(getColorAt(0.75, settings.gradient)).toStrictEqual(
    "rgba(0, 255, 0, 0.60)",
  );
});

test("Specific color value: 1.0", () => {
  expect(getColorAt(1.0, settings.gradient)).toStrictEqual(
    "rgba(0, 255, 0, 0.60)",
  );
});

test("Specific color value: 1.1", () => {
  expect(getColorAt(1.1, settings.gradient)).toStrictEqual(
    "rgba(0, 255, 0, 0.60)",
  );
});

/**
 * Display color spectrum
 *   show color increments from 1.1 .. -0.1 to verify the RGB values
 * (Uncomment the two lines to show the tests)
 */
test("Color spectrum", () => {
  for (let i = 1.1; i > -0.1; i = i - 0.05) {
    const resultColor = getColorAt(i, settings.gradient);
    console.log(`value/color: ${i.toFixed(2)} ${JSON.stringify(resultColor)}`);
  }
});

// test("fixed colors", () => {
//   let resultColor = getColorAt(0.84, settings.gradient);
//   console.log(
//     `value/color: ${(0.84).toFixed(2)} ${JSON.stringify(resultColor)}`,
//   );
//   resultColor = getColorAt(0.86, settings.gradient);
//   console.log(
//     `value/color: ${(0.86).toFixed(2)} ${JSON.stringify(resultColor)}`,
//   );
// });
