import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile and the desktop app (desktop/build-server.mjs) set
  // NEXT_OUTPUT_STANDALONE so they only ship the files the server needs.
  // Local `npm run build && npm start` is unchanged.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  // Trace from this directory, not from a parent that happens to have its own
  // lockfile (git worktrees, monorepo checkouts). Otherwise the standalone
  // server.js lands in a nested folder instead of .next/standalone/server.js.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // koffi (Windows WLAN API, src/lib/wlan-api.ts) is a native module: load it
  // from node_modules at runtime instead of bundling it, so the standalone
  // tracer copies it (and its prebuilt .node binaries) into the output.
  serverExternalPackages: ["koffi"],
  // React Compiler: memoizes components and hooks, so code doesn't need
  // useMemo/useCallback for speed. all_errors makes the build fail when the
  // compiler has to skip a component (unsupported syntax, a rule of React
  // broken) instead of quietly leaving it unoptimized; fix the code, or add
  // "use no memo" to that component with a comment saying why.
  reactCompiler: { panicThreshold: "all_errors" },
  // `next dev` refuses its own scripts and live-reload socket to pages
  // opened from any host but localhost, so a page opened by LAN address
  // (http://192.168.1.20:3000) never becomes interactive. Allow the same
  // local hosts the API accepts (src/lib/request-guard.ts): private IPv4
  // ranges, local suffixes and WIFI_HEATMAPPER_ALLOWED_HOSTS. A single-label
  // name ("nas") can't be a pattern; add it to that variable. Dev only.
  allowedDevOrigins: [
    "127.*.*.*",
    "10.*.*.*",
    "192.168.*.*",
    ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
    "169.254.*.*",
    "**.local",
    "**.lan",
    "**.home.arpa",
    "**.internal",
    ...(process.env.WIFI_HEATMAPPER_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().replace(/:\d+$/, ""))
      .filter(Boolean),
  ],
  // The e2e scripts build into .next-e2e so they can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
