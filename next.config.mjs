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
  // The e2e scripts build into .next-e2e so they can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
