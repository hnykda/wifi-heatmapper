/**
 * Installs the Windows installers the way users do and runs
 * smoke-test-app.mjs against each installed app (release.yml, pull requests):
 *
 *   node desktop/smoke-test-windows-install.mjs <bundle dir> <log dir>
 *
 * 1. the MSI (per-machine, Program Files): install, test, uninstall;
 * 2. the NSIS setup (per-user, %LOCALAPPDATA%): install, test.
 * MSI first, on the clean runner: the MSI reuses the install folder an NSIS
 * install recorded in the registry (even after NSIS uninstalls), so after
 * NSIS it would land in %LOCALAPPDATA% instead of Program Files.
 *
 * Every step has its own time limit; a step over it has its whole process
 * tree killed (taskkill /T /F) and fails with what it printed, so the job
 * never hangs on an installer or an app that does not quit. The app test is
 * run a second time only for a failure known to be a runner flake
 * (smoke-test-app.mjs exits with 75, or hangs). The installer logs and the
 * app's server log are copied to <log dir> for the workflow to upload.
 */
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";

if (process.platform !== "win32") {
  throw new Error("smoke-test-windows-install.mjs is Windows-only");
}
const [bundleArg, logArg] = process.argv.slice(2);
if (!bundleArg || !logArg) {
  throw new Error(
    "usage: smoke-test-windows-install.mjs <bundle dir> <log dir>",
  );
}
const bundle = resolve(bundleArg);
const logDir = resolve(logArg);
mkdirSync(logDir, { recursive: true });

const KNOWN_FLAKE = 75; // smoke-test-app.mjs: only failures known to be flaky
const appLog = join(
  process.env.LOCALAPPDATA,
  "com.github.hnykda.wifi-heatmapper",
  "logs",
  "server.log",
);

const started = Date.now();
const say = (message) =>
  console.log(
    `[${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s] ${message}`,
  );

/** End a process and everything it started; never waits more than 30 s. */
function killTree(pid) {
  return new Promise((done) => {
    const killer = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
      stdio: "ignore",
    });
    const timer = setTimeout(done, 30_000);
    killer.on("exit", () => (clearTimeout(timer), done()));
    killer.on("error", () => (clearTimeout(timer), done()));
  });
}

/**
 * Run a command with a time limit. Its output is passed through (not
 * inherited, so nothing it leaves behind holds the step's output open).
 * Resolves to { code, timedOut }.
 */
function step(label, command, args, limitMs) {
  say(`${label}: ${command} ${args.join(" ")}`);
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      say(
        `${label}: ${result.timedOut ? "TIMED OUT" : `exit code ${result.code}`}`,
      );
      done(result);
    };
    const timer = setTimeout(async () => {
      say(`${label}: over ${limitMs / 1000} s, killing its process tree`);
      await killTree(child.pid);
      finish({ code: null, timedOut: true });
    }, limitMs);
    child.on("error", (err) => {
      say(`${label}: ${err.message}`);
      finish({ code: null, timedOut: false });
    });
    // "exit", not "close": a process it left behind may keep the pipes open
    child.on("exit", (code) => finish({ code, timedOut: false }));
  });
}

function tail(file, lines = 60) {
  if (!existsSync(file)) return `(no ${file})`;
  // msiexec writes UTF-16
  const raw = readFileSync(file);
  const text =
    raw[0] === 0xff && raw[1] === 0xfe
      ? raw.toString("utf16le")
      : raw.toString("utf8");
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

function saveLog(file, name) {
  if (existsSync(file)) copyFileSync(file, join(logDir, name));
}

async function fail(message, logs = []) {
  console.log(`::error::${message}`);
  for (const file of logs) {
    console.log(`::group::${file} (last lines)`);
    console.log(tail(file));
    console.log("::endgroup::");
  }
  saveLog(appLog, "server.log");
  process.exit(1);
}

/** smoke-test-app.mjs, once more if the first run hit a known runner flake. */
async function smokeTest(label, exe) {
  for (let attempt = 1; ; attempt++) {
    // its own limit is 4 minutes; this one also covers a run that hangs
    const run = await step(
      `${label} app test (attempt ${attempt})`,
      process.execPath,
      [join(import.meta.dirname, "smoke-test-app.mjs"), exe],
      300_000,
    );
    saveLog(appLog, `server-${label}-${attempt}.log`);
    if (run.code === 0) return;
    const flaky = run.timedOut || run.code === KNOWN_FLAKE;
    if (flaky && attempt === 1) {
      console.log(
        `::warning::${label}: the app test ${run.timedOut ? "hung" : "hit a known flake (the app did not quit on a window close)"}; running it again`,
      );
      continue;
    }
    await fail(`${label}: the installed app failed its test`, [appLog]);
  }
}

const find = (dir, pattern) => {
  const name = readdirSync(join(bundle, dir)).find((f) => pattern.test(f));
  if (!name) throw new Error(`no ${pattern} in ${join(bundle, dir)}`);
  return join(bundle, dir, name);
};
const INSTALLER_LIMIT = 180_000;

// 1. MSI
const msi = find("msi", /\.msi$/);
const msiLog = join(logDir, "msi-install.log");
let r = await step(
  "MSI install",
  "msiexec",
  ["/i", msi, "/qn", "/norestart", "/l*v", msiLog],
  INSTALLER_LIMIT,
);
if (r.code !== 0) await fail("MSI install failed", [msiLog]);
const msiExe = join(
  process.env.ProgramFiles,
  "WiFi Heatmapper",
  "wifi-heatmapper.exe",
);
if (!existsSync(msiExe)) {
  const dirs = tail(msiLog, 100000)
    .split("\n")
    .filter((l) => l.includes("INSTALLDIR"))
    .join("\n");
  await fail(`the MSI did not install ${msiExe}\n${dirs}`);
}
await smokeTest("msi", msiExe);

const msiUninstallLog = join(logDir, "msi-uninstall.log");
r = await step(
  "MSI uninstall",
  "msiexec",
  ["/x", msi, "/qn", "/norestart", "/l*v", msiUninstallLog],
  INSTALLER_LIMIT,
);
if (r.code !== 0 || existsSync(msiExe)) {
  await fail(
    `MSI uninstall failed (exit code ${r.code}, app still there: ${existsSync(msiExe)})`,
    [msiUninstallLog],
  );
}

// 2. NSIS
const nsis = find("nsis", /-setup\.exe$/);
r = await step("NSIS install", nsis, ["/S"], INSTALLER_LIMIT);
if (r.code !== 0) await fail(`NSIS install failed (exit code ${r.code})`);
const nsisExe = join(
  process.env.LOCALAPPDATA,
  "WiFi Heatmapper",
  "wifi-heatmapper.exe",
);
if (!existsSync(nsisExe))
  await fail(`the NSIS setup did not install ${nsisExe}`);
await smokeTest("nsis", nsisExe);

say("installed-app tests passed");
process.exit(0);
