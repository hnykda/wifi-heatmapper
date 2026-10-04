/**
 * Starts the assembled desktop server the way the shell does and checks it
 * works from a read-only copy with its data somewhere else.
 *
 *   node desktop/smoke-test.mjs [server dir]   (default: desktop/server)
 *
 * Mock mode, a temp data dir, a free port on 127.0.0.1. Checks the page and
 * its static assets, /api/status, the seeded floor plans, a survey write,
 * that nothing was written into the server dir, and that closing stdin
 * stops the server (how the shell avoids orphaned node processes).
 * Run by CI (.github/workflows/ci.yaml, desktop-server job).
 */
import { spawn } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] ?? join(here, "server"));
const exe = process.platform === "win32" ? "node.exe" : "node";
if (!existsSync(join(source, exe))) {
  throw new Error(`no ${exe} in ${source}: run desktop/build-server.mjs first`);
}

const work = mkdtempSync(join(tmpdir(), "wifi-heatmapper-smoke-"));
const serverDir = join(work, "server");
const dataDir = join(work, "app-data", "data");
cpSync(source, serverDir, { recursive: true });

function setWritable(dir, writable) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) setWritable(p, writable);
  }
  // only directories: enough to make creating files fail, and keeps the copy deletable
  chmodSync(dir, writable ? 0o755 : 0o555);
}
// The installed app's bundle is read-only; make sure the server copes.
if (process.platform !== "win32") setWritable(serverDir, false);

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

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const child = spawn(join(serverDir, exe), ["server-entry.mjs"], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    WIFI_HEATMAPPER_DATA_DIR: dataDir,
    WIFI_HEATMAPPER_RESOURCES_DIR: serverDir,
    WIFI_HEATMAPPER_MOCK: "1",
  },
  stdio: ["pipe", "inherit", "inherit"],
});
let exited = null;
const exitPromise = new Promise((ok) =>
  child.on("exit", (code, signal) => {
    exited = { code, signal };
    ok(exited);
  }),
);

function cleanup() {
  if (!exited) child.kill("SIGKILL");
  if (process.platform !== "win32") setWritable(serverDir, true);
  rmSync(work, { recursive: true, force: true });
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    cleanup();
    process.exit(1);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function get(path, init) {
  const res = await fetch(base + path, init);
  assert(res.ok, `${init?.method ?? "GET"} ${path} -> ${res.status}`);
  return res;
}

await check("server answers within 30 s", async () => {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (exited) throw new Error(`server exited early: ${JSON.stringify(exited)}`);
    try {
      if ((await fetch(`${base}/api/status`)).ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
});

await check("/api/status reports mock mode and the data dir", async () => {
  const status = await (await get("/api/status")).json();
  assert(status.mockMode === true, `mockMode is ${status.mockMode}`);
  assert(status.dataDir === dataDir, `dataDir is ${status.dataDir}`);
});

await check("/ and its static assets", async () => {
  const html = await (await get("/")).text();
  const assets = [...html.matchAll(/\/_next\/static\/[^"']+\.(?:js|css)/g)];
  assert(assets.length > 0, "no /_next/static references in the page");
  await get(assets[0][0]);
  await get("/favicon.ico");
});

await check("bundled floor plans are seeded into the data dir", async () => {
  const { files } = await (await get("/api/media")).json();
  assert(files.includes("EmptyFloorPlan.png"), `files: ${files}`);
  assert(existsSync(join(dataDir, "media", "EmptyFloorPlan.png")), "not on disk");
  await get("/api/media/EmptyFloorPlan.png");
});

await check("a survey can be saved", async () => {
  await get("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ floorplanImageName: "EmptyFloorPlan.png" }),
  });
  const surveys = readdirSync(join(dataDir, "surveys"));
  assert(surveys.length === 1, `surveys dir: ${surveys}`);
});

await check("closing stdin stops the server", async () => {
  child.stdin.end();
  const timeout = new Promise((r) => setTimeout(() => r(null), 10_000));
  const result = await Promise.race([exitPromise, timeout]);
  assert(result, "still running 10 s after stdin closed");
});

cleanup();
console.log("smoke test passed");
