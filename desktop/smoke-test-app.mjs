/**
 * Starts a built or installed desktop app (Windows) the way a user would and
 * checks that it runs the bundled server, and that the server and everything
 * it started go away with the app.
 *
 *   node desktop/smoke-test-app.mjs "C:\...\WiFi Heatmapper\wifi-heatmapper.exe"
 *
 * Run by .github/workflows/release.yml on the Windows runner against the
 * NSIS- and MSI-installed app. Mock mode, a temp data dir, a pinned port.
 *
 * To check the process tree, NODE_OPTIONS (inherited by the server, see the
 * contract in src-tauri/src/main.rs) preloads a script into the server that
 * starts a long-running, detached grandchild (`ping -n 600`), standing in for
 * an iperf3 or netsh that is mid-run, and writes both PIDs to a file. Then:
 *
 * 1. close the window (taskkill without /F, i.e. WM_CLOSE): the app's normal
 *    quit path must end node.exe and the grandchild;
 * 2. start again and kill the app (taskkill /F, like Task Manager or a crash):
 *    the Job Object must end both. The server's own "stdin closed" exit would
 *    end node.exe but not the grandchild, so this tells the two apart.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "win32") {
  throw new Error("smoke-test-app.mjs is Windows-only for now");
}
const exe = resolve(process.argv[2] ?? "");
if (!existsSync(exe)) throw new Error(`no app at ${exe}`);
for (const p of [
  "server/node.exe",
  "server/server-entry.mjs",
  "server/server.js",
]) {
  if (!existsSync(join(exe, "..", p)))
    throw new Error(`no ${p} next to ${exe}`);
}

// Never hang a CI job: every wait below has its own limit, this is the backstop.
setTimeout(() => {
  console.error("FAIL the whole test took over 4 minutes");
  process.exit(1);
}, 240_000).unref();

const work = mkdtempSync(join(tmpdir(), "wifi-heatmapper-app-smoke-"));
const preload = join(work, "preload.cjs");
writeFileSync(
  preload,
  `
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
if (/server-entry\\.mjs$/.test(process.argv[1] || "")) {
  // a moment later, like a real measurement, not while the app is still
  // setting the process up
  setTimeout(() => {
    const child = spawn("ping", ["-n", "600", "127.0.0.1"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    writeFileSync(process.env.SMOKE_PIDS_FILE, JSON.stringify({ node: process.pid, grandchild: child.pid }));
  }, 1000).unref();
}
`,
);

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, cond, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await cond();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out: ${what}`);
    await sleep(250);
  }
}

let failed = false;
function fail(message) {
  console.error(`FAIL ${message}`);
  failed = true;
}
function ok(message) {
  console.log(`ok   ${message}`);
}

async function run(label, quit) {
  console.log(`\n# ${label}`);
  const port = await freePort();
  const dataDir = join(work, label, "data");
  const pidsFile = join(work, `${label}.pids.json`);
  const app = spawn(exe, [], {
    env: {
      ...process.env,
      WIFI_HEATMAPPER_MOCK: "1",
      WIFI_HEATMAPPER_PORT: String(port),
      WIFI_HEATMAPPER_DATA_DIR: dataDir,
      NODE_OPTIONS: `--require "${preload.replaceAll("\\", "/")}"`,
      SMOKE_PIDS_FILE: pidsFile,
    },
    stdio: "ignore",
  });
  let appExited = false;
  app.on("exit", () => (appExited = true));

  try {
    const status = await until(
      "the server answers",
      async () => {
        if (appExited) throw new Error("the app exited");
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
            signal: AbortSignal.timeout(5000),
          });
          return res.ok && (await res.json());
        } catch {
          return null;
        }
      },
      90_000,
    );
    ok(
      `server answers on ${port} (Node ${status.nodeVersion}, ${status.osName})`,
    );
    if (status.mockMode !== true) fail(`mockMode is ${status.mockMode}`);
    if (status.dataDir !== dataDir) fail(`dataDir is ${status.dataDir}`);
    const page = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (page.ok) ok("/ answers 200");
    else fail(`/ answers ${page.status}`);

    const pids = await until(
      "the server reports its PIDs",
      () => existsSync(pidsFile) && JSON.parse(readFileSync(pidsFile, "utf8")),
      15_000,
    );
    if (alive(pids.node) && alive(pids.grandchild)) {
      ok(
        `node.exe ${pids.node} and its child ping.exe ${pids.grandchild} running`,
      );
    } else fail(`not running: ${JSON.stringify(pids)}`);

    const killed = quit(app.pid);
    if (killed.status !== 0) {
      fail(`taskkill: ${killed.stdout}${killed.stderr}`);
      return;
    }
    await until("the app exits", () => appExited, 20_000);
    ok("the app exited");
    try {
      await until(
        "node.exe and ping.exe are gone",
        () => !alive(pids.node) && !alive(pids.grandchild),
        10_000,
      );
      ok("node.exe and its child are gone");
    } catch (err) {
      fail(
        `${err.message}: node ${alive(pids.node)}, ping ${alive(pids.grandchild)}`,
      );
    }
    if (existsSync(join(dataDir, "media", "EmptyFloorPlan.png")))
      ok("floor plans seeded in the data dir");
    else fail(`no floor plans in ${dataDir}`);
  } catch (err) {
    fail(err.message);
  } finally {
    if (!appExited)
      spawnSync("taskkill", ["/F", "/T", "/PID", String(app.pid)], {
        timeout: 15_000,
      });
  }
}

const taskkill =
  (...args) =>
  (pid) =>
    spawnSync("taskkill", [...args, "/PID", String(pid)], {
      encoding: "utf8",
      timeout: 15_000,
    });

await run("close-window", taskkill());
await run("kill", taskkill("/F"));

const log = join(
  process.env.LOCALAPPDATA,
  "com.github.hnykda.wifi-heatmapper",
  "logs",
  "server.log",
);
if (existsSync(log)) ok(`server log at ${log}`);
else fail(`no server log at ${log}`);

rmSync(work, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("\napp smoke test passed");
process.exit(0);
