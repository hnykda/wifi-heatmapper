import { expect, test, describe } from "vitest";
// import { parseNetshOutput } from "../../src/lib/wifiScanner-windows";
// import { initLocalization } from "../../src/lib/localization";
import { normalizeMacAddress } from "../../src/lib/wifiScanner";

// let reverseLookupTable: Map<string, string>;

// beforeAll(async () => {
//   reverseLookupTable = await initLocalization(); // build your structure
// });

describe("Checking MAC normalization code", () => {
  test("Checking normalizeMacAddress with ':'", () => {
    const input = "12:34:56:78:90:ab";
    const output = normalizeMacAddress(input);
    expect(output).toEqual("1234567890ab");
  });

  test("Checking normalizeMacAddress with '-'", () => {
    const input = "12-34-56-78-90-ab";
    const output = normalizeMacAddress(input);
    expect(output).toEqual("1234567890ab");
  });
});
