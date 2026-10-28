/**
 * main.ts - entry point of the wifi-heatmapper MCP server (stdio).
 *
 * Built into one self-contained file by scripts/build-mcp.mjs:
 *   npm run mcp:build   ->  dist/mcp/wifi-heatmapper-mcp.mjs
 * The desktop app ships the same file as <server dir>/mcp-server.mjs.
 *
 * Env: WIFI_HEATMAPPER_URL               the running app (default http://localhost:3000)
 *      WIFI_HEATMAPPER_MCP_ALLOW_REMOTE  1 to allow a non-loopback URL (not recommended)
 *
 * stdout carries the MCP protocol; everything else goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../../package.json";
import { AppClient, resolveAppUrl } from "./app-client";
import { createMcpServer } from "./server";

const HELP = `wifi-heatmapper MCP server ${version}

Lets an AI agent read surveys from a running wifi-heatmapper app, help with
setup and interpret results. Speaks MCP over stdio; start it from an MCP
client, not by hand. See docs/guide/mcp.md.

Environment:
  WIFI_HEATMAPPER_URL               the app (default http://localhost:3000)
  WIFI_HEATMAPPER_MCP_ALLOW_REMOTE  set to 1 to allow a non-loopback address
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }
  if (args.includes("--version")) {
    process.stdout.write(`${version}\n`);
    return;
  }

  const baseUrl = resolveAppUrl(process.env);
  const client = new AppClient({ baseUrl });
  const server = createMcpServer(client, version);
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `wifi-heatmapper MCP server ${version}: using the app at ${baseUrl.origin}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `wifi-heatmapper MCP server: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
});
