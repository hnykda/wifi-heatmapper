import { beforeEach, describe, expect, test } from "vitest";
import {
  appendLogLine,
  clearLogBuffer,
  formatLogObject,
  getLogger,
  LOG_BUFFER_MAX_BYTES,
  LOG_BUFFER_MAX_LINES,
  recentLogLines,
  rememberSecret,
} from "../src/lib/logger";

describe("the in-memory log buffer", () => {
  beforeEach(() => clearLogBuffer());

  test("keeps what the loggers print", () => {
    const logger = getLogger("buffer-test");
    logger.warn("something odd:", { code: 7 });
    const lines = recentLogLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\[\d{4}-\d\d-\d\dT[\d:.]+Z\] \[buffer-test:WARN\] something odd: \{"code":7\}$/,
    );
  });

  test("formats errors by name and message", () => {
    const line = formatLogObject({
      0: "failed:",
      1: { nativeError: {}, name: "Error", message: "boom", stack: [] },
      _meta: { name: "x", logLevelName: "ERROR", date: new Date(0) },
    });
    expect(line).toBe(
      "[1970-01-01T00:00:00.000Z] [x:ERROR] failed: Error: boom",
    );
  });

  test("masks the sudo password, known or in a command line", () => {
    rememberSecret("correct-horse");
    const logger = getLogger("buffer-test");
    logger.info("pw is correct-horse");
    logger.info("Executing command: echo other | sudo -S wdutil info");
    logger.info({ sudoerPassword: "plain", iperfServerAdrs: "x" });
    const text = recentLogLines().join("\n");
    expect(text).not.toContain("correct-horse");
    expect(text).not.toContain("echo other");
    expect(text).not.toContain("plain");
  });

  test("keeps at most the last lines and bytes", () => {
    for (let i = 0; i < LOG_BUFFER_MAX_LINES + 50; i++) appendLogLine(`l${i}`);
    const lines = recentLogLines();
    expect(lines).toHaveLength(LOG_BUFFER_MAX_LINES);
    expect(lines.at(-1)).toBe(`l${LOG_BUFFER_MAX_LINES + 49}`);

    clearLogBuffer();
    for (let i = 0; i < 100; i++) appendLogLine("y".repeat(1500));
    const bytes = recentLogLines().reduce((n, l) => n + l.length + 1, 0);
    expect(bytes).toBeLessThanOrEqual(LOG_BUFFER_MAX_BYTES);
  });

  test("shortens very long lines", () => {
    appendLogLine("z".repeat(10_000));
    expect(recentLogLines()[0].length).toBeLessThan(2100);
  });
});
