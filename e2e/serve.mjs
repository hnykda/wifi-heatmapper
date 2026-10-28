/**
 * The e2e web server (playwright.config.ts webServer): runs
 * `npm run e2e:serve:<dev|prod> -- -p <port>`, passes its output through
 * and also writes it to .e2e-data/server.log, which server-log.ts checks
 * for errors at the end of the run.
 *
 *   node e2e/serve.mjs dev 3100
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";

const SERVER_LOG = ".e2e-data/server.log"; // also in server-log.ts

const [mode = "dev", port = "3100"] = process.argv.slice(2);

mkdirSync(".e2e-data", { recursive: true });
const log = openSync(SERVER_LOG, "w");

const child = spawn("npm", ["run", `e2e:serve:${mode}`, "--", "-p", port], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: process.platform === "win32", // npm is npm.cmd there
});
for (const [from, to] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  from.on("data", (chunk) => {
    to.write(chunk);
    writeSync(log, chunk); // at once, so the check sees the last lines
  });
}

// Playwright stops the server by signalling this process (its group on
// Linux and macOS); pass it on so next never outlives the run
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  closeSync(log);
  process.exit(code ?? (signal ? 1 : 0));
});
