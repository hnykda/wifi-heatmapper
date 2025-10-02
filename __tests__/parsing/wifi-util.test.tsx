import { expect, test, describe } from "vitest";
import { normalizeMacAddress } from "../../src/lib/utils";

describe("Checking MAC normalization code with ':'", () => {
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
