#!/usr/bin/env node
// `npm run build:macos-helper` - builds the helper on macOS, explains and
// exits 0 elsewhere (so the script is safe to call from any build).
// Usage: node native/macos-wifi-helper/build.mjs [output-dir]
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.log(
    "build:macos-helper: skipped, the Wi-Fi helper is only used on macOS.",
  );
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(
  "/bin/sh",
  [join(here, "build.sh"), ...process.argv.slice(2)],
  {
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
