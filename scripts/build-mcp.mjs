/**
 * Bundles the MCP server (src/mcp/main.ts) into one self-contained ESM file
 * that runs on plain Node 20+, with no node_modules next to it. The desktop
 * app ships it (desktop/build-server.mjs); from a checkout, run it with node.
 *
 *   node scripts/build-mcp.mjs [outfile]   (default: dist/mcp/wifi-heatmapper-mcp.mjs)
 *
 * The MCP SDK is a devDependency and only ever reaches this bundle, never
 * the Next.js app.
 */
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(
  process.argv[2] ?? join(repoRoot, "dist", "mcp", "wifi-heatmapper-mcp.mjs"),
);

await build({
  absWorkingDir: repoRoot,
  entryPoints: [join(repoRoot, "src", "mcp", "main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  tsconfig: join(repoRoot, "tsconfig.json"),
  // Some dependencies are CommonJS and call require() for Node built-ins.
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  legalComments: "none",
  logLevel: "warning",
});

console.error(`MCP server bundled into ${outfile}`);
