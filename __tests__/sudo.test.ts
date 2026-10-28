/** The sudo password is checked once per password value (lib/sudo.ts). */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/server-utils", () => ({ execAsync: vi.fn() }));

const { execAsync } = await import("../src/lib/server-utils");
const { checkSudoPassword, forgetSudoPassword } = await import(
  "../src/lib/sudo"
);
const mockExec = vi.mocked(execAsync);

let good: string;
beforeEach(() => {
  forgetSudoPassword();
  mockExec.mockReset();
  good = "right";
  mockExec.mockImplementation(async (command: string) => {
    if (command.includes(`echo ${good} |`)) return { stdout: "", stderr: "" };
    throw new Error("Sorry, try again.");
  });
});

describe("checkSudoPassword", () => {
  test("a password that worked is not checked again", async () => {
    expect(await checkSudoPassword("right")).toBe(true);
    expect(await checkSudoPassword("right")).toBe(true);
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  test("a wrong password is checked every time, so fixing it works at once", async () => {
    expect(await checkSudoPassword("wrong")).toBe(false);
    expect(await checkSudoPassword("wrong")).toBe(false);
    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(await checkSudoPassword("right")).toBe(true);
  });

  test("another password is checked again", async () => {
    expect(await checkSudoPassword("right")).toBe(true);
    good = "new";
    expect(await checkSudoPassword("new")).toBe(true);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });
});
