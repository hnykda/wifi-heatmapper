/**
 * Global setup (playwright.config.ts): at the end of the run, fail if the
 * e2e server printed an error. The server (e2e/serve.mjs) writes its
 * output to .e2e-data/server.log; this checks what it wrote during the
 * run. A server you started yourself (reused, see the config) writes no
 * log, so nothing is checked then.
 *
 * What counts: Next's own error lines (an uncaught exception, a route that
 * threw, an unhandled rejection), not the app's logger: tests make
 * measurements fail on purpose, and the app logs that.
 */
import { existsSync, readFileSync, statSync } from "node:fs";

const SERVER_LOG = ".e2e-data/server.log"; // also in serve.mjs
const ERROR = /⨯|uncaughtException|unhandledRejection|ECONNRESET/;

const size = () => (existsSync(SERVER_LOG) ? statSync(SERVER_LOG).size : 0);

export default function globalSetup() {
  // The server is up by now; what it prints from here on is the tests'
  const start = size();
  return function checkServerLog() {
    if (size() <= start) return;
    const lines = readFileSync(SERVER_LOG)
      .subarray(start)
      .toString()
      .split("\n");
    const errors = lines.flatMap((line, i) =>
      ERROR.test(line)
        ? [lines.slice(Math.max(0, i - 5), i + 4).join("\n")]
        : [],
    );
    if (errors.length === 0) return;
    throw new Error(
      `The e2e server logged ${errors.length} error line(s) (${SERVER_LOG}). ` +
        "A test probably ended while a request was still running, or a " +
        "route failed. The first one, with the requests before it:\n\n" +
        errors[0],
    );
  };
}
