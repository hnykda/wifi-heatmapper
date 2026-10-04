/**
 * Assembles the server the desktop app runs into `desktop/server/`. Tauri
 * ships that directory as a resource (src-tauri/tauri.conf.json) and
 * src-tauri/src/main.rs starts it on launch.
 *
 *   desktop/server/
 *   ├── node(.exe)            official Node runtime for this platform/arch
 *   ├── server-entry.mjs      exits when the app goes away, then loads server.js
 *   ├── server.js             Next's `output: "standalone"` server
 *   ├── node_modules/         only what server.js needs (traced by Next)
 *   ├── .next/                server build + .next/static
 *   ├── public/, assets/      favicon, bundled floor plans
 *   ├── data/localization/    netsh label tables (Windows)
 *   └── helpers/              macOS only: WiFiHeatmapperHelper.app
 *
 * Nothing in here is written at runtime: user data goes to
 * WIFI_HEATMAPPER_DATA_DIR, which the shell points at the app-data folder.
 *
 * Usage: node desktop/build-server.mjs   (from anywhere)
 * Env:   WIFI_HEATMAPPER_NODE_VERSION    Node version to ship (default below)
 *        MACOS_HELPER_SIGN_IDENTITY      macOS: certificate for the Wi-Fi helper
 *        MACOS_HELPER_SIGN_KEYCHAIN      (default ad-hoc; see
 *                                        native/macos-wifi-helper/README.md)
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outDir = join(here, "server");
const cacheDir = join(here, ".cache");
// Its own dist dir so this never clobbers a `npm run build` in .next.
const distDirName = ".next-desktop";
const distDir = join(repoRoot, distDirName);

/**
 * The Node release the app ships. Same major as the Docker image and CI, so
 * the bundled server runs on what is tested. Bump together with the Dockerfile.
 */
const NODE_VERSION = process.env.WIFI_HEATMAPPER_NODE_VERSION || "22.23.3";

/**
 * How nodejs.org names its downloads, per platform. Adding a platform means
 * adding a row here (and a matrix row in .github/workflows/release.yml).
 */
const NODE_DIST = {
  darwin: { os: "darwin", archive: "tar.gz", binary: "bin/node", exe: "" },
  linux: { os: "linux", archive: "tar.xz", binary: "bin/node", exe: "" },
  win32: { os: "win", archive: "zip", binary: "node.exe", exe: ".exe" },
};
const NODE_ARCH = { arm64: "arm64", x64: "x64" };

function mib(path) {
  let total = 0;
  const walk = (p) => {
    const s = statSync(p);
    if (s.isDirectory()) for (const n of readdirSync(p)) walk(join(p, n));
    else total += s.size;
  };
  walk(path);
  return `${(total / 1024 / 1024).toFixed(1)} MiB`;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  }
}

/**
 * Downloads (and caches in desktop/.cache) the official Node build for this
 * platform and returns the path of its `node` binary. Not the `node` on PATH:
 * Homebrew's is a shim linked against Homebrew dylibs and dies inside an app
 * bundle; nodejs.org builds are self-contained.
 */
async function officialNodeBinary(version) {
  const dist = NODE_DIST[process.platform];
  const arch = NODE_ARCH[process.arch];
  if (!dist || !arch) {
    throw new Error(`no Node download for ${process.platform}-${process.arch}`);
  }
  const name = `node-v${version}-${dist.os}-${arch}`;
  const binary = join(cacheDir, name, dist.binary);
  if (existsSync(binary)) return binary;

  mkdirSync(cacheDir, { recursive: true });
  const file = `${name}.${dist.archive}`;
  const url = `https://nodejs.org/dist/v${version}/${file}`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download ${url}: ${res.status}`);
  const archive = join(cacheDir, file);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  // bsdtar (macOS, Windows 10+) and GNU tar all read these formats. On
  // Windows, name System32's bsdtar: a `tar` earlier on PATH may be Git's GNU
  // tar, which cannot read .zip and takes `C:\...` for a remote host. No shell,
  // so a checkout path with spaces is passed through intact.
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
      : "tar";
  run(tar, ["-xf", archive, "-C", cacheDir], { shell: false });
  rmSync(archive);
  if (!existsSync(binary)) throw new Error(`no node binary at ${binary}`);
  return binary;
}

// 1. Next's standalone build, from this checkout, every time (never "if
// missing": a stale build next to a newer shell is a confusing bug).
console.log("building the Next.js standalone server");
run("npx", ["next", "build"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NEXT_OUTPUT_STANDALONE: "1",
    NEXT_DIST_DIR: distDirName,
    // the build itself must not pick up mock mode etc. from the caller
    WIFI_HEATMAPPER_MOCK: "",
  },
});

const standalone = join(distDir, "standalone");
if (!existsSync(join(standalone, "server.js"))) {
  throw new Error(`no server.js in ${standalone}`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 2. The server and its traced node_modules. Next's tracer also pulls in
// whatever sits under data/ (it sees getDataDir()), which on a developer
// machine can be real surveys: copy everything but data/ and assets/, then add
// exactly the shipped parts from the repo below.
for (const name of readdirSync(standalone)) {
  if (name === "data" || name === "assets") continue;
  cpSync(join(standalone, name), join(outDir, name), {
    recursive: true,
    dereference: true,
  });
}
// standalone/ keeps the dist dir name; server.js reads it from its embedded config
cpSync(join(distDir, "static"), join(outDir, distDirName, "static"), {
  recursive: true,
});
cpSync(join(repoRoot, "public"), join(outDir, "public"), { recursive: true });
cpSync(join(repoRoot, "assets"), join(outDir, "assets"), { recursive: true });
cpSync(
  join(repoRoot, "data", "localization"),
  join(outDir, "data", "localization"),
  { recursive: true },
);
// Uploads from versions < 0.5.0; never part of a release.
rmSync(join(outDir, "public", "media"), { recursive: true, force: true });
// sharp is Next's optional image optimizer (next/image), which the app does
// not use; Next only loads it for /_next/image requests. Its libvips builds
// for every libc (glibc and musl) are ~30 MB, and the AppImage bundler
// (linuxdeploy) fails on the musl ones because it tries to resolve their
// libraries on the build machine.
for (const name of ["sharp", "@img"]) {
  rmSync(join(outDir, "node_modules", name), { recursive: true, force: true });
}
cpSync(join(here, "server-entry.mjs"), join(outDir, "server-entry.mjs"));
console.log(`server            ${mib(outDir)}`);

// 3. The Node runtime.
const nodeBin = await officialNodeBinary(NODE_VERSION);
const nodeOut = join(outDir, `node${NODE_DIST[process.platform].exe}`);
cpSync(nodeBin, nodeOut);
chmodSync(nodeOut, 0o755);
const shipped = spawnSync(nodeOut, ["--version"], { encoding: "utf8" });
if (shipped.stdout?.trim() !== `v${NODE_VERSION}`) {
  throw new Error(`${nodeOut} --version: ${shipped.stdout}${shipped.stderr}`);
}
console.log(`node              ${mib(nodeOut)}  (v${NODE_VERSION})`);

// 4. Check the tree is something every installer can carry (before the
// macOS-only helper, which no Windows installer carries): no symlinks
// (MSI and NSIS cannot represent them; the copies above dereference) and no
// path that gets near Windows' 260-character MAX_PATH once installed under
// "C:\Program Files\WiFi Heatmapper\server\" (~40 characters) or the per-user
// "%LOCALAPPDATA%\WiFi Heatmapper\server\" (~60, depends on the user name).
const MAX_RELATIVE_PATH = 160;
let longest = "";
let files = 0;
const inspect = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink in the bundle: ${p}`);
    if (entry.isDirectory()) inspect(p);
    else {
      files++;
      const rel = relative(outDir, p);
      if (rel.length > longest.length) longest = rel;
    }
  }
};
inspect(outDir);
if (longest.length > MAX_RELATIVE_PATH) {
  throw new Error(`path too long for a Windows install: ${longest}`);
}
console.log(`files             ${files}, longest path ${longest.length} chars`);

// 5. macOS: the Wi-Fi helper (native/macos-wifi-helper), a nested app bundle
// with its own bundle id, because macOS grants Location (and so the SSID) per
// bundle. The server finds it at $WIFI_HEATMAPPER_RESOURCES_DIR/helpers/.
// build.sh signs it (MACOS_HELPER_SIGN_IDENTITY); Tauri copies it as is and
// signs only the outer app, so that signature survives into the .dmg.
if (process.platform === "darwin") {
  const helpers = join(outDir, "helpers");
  run(process.execPath, [
    join(repoRoot, "native", "macos-wifi-helper", "build.mjs"),
    helpers,
  ]);
  console.log(`helper            ${mib(helpers)}`);
}

console.log(`\nserver ready at ${outDir} (${mib(outDir)})`);
