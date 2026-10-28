/**
 * The API runs shell commands (iw, netsh, iperf3) on this machine, so it
 * must only answer the app's own pages and local tools such as the MCP
 * server. Two attacks to stop:
 *
 * - Cross-site requests: any web page can POST to http://localhost:3000
 *   (a text/plain body needs no CORS preflight). Browsers always send
 *   Origin on such requests, so a changing request whose Origin is not
 *   this host is refused. Clients that send no Origin (curl, the MCP
 *   server) are not browsers on someone else's page, so they pass.
 * - DNS rebinding: a public name such as evil.example re-pointed at
 *   127.0.0.1 makes the request same-origin. So the Host must be a
 *   loopback name, an IP address, a single-label LAN name ("nas") or a
 *   local suffix (.local, .lan, .home.arpa, .internal), or be listed in
 *   WIFI_HEATMAPPER_ALLOWED_HOSTS (comma-separated).
 */

const LOCAL_SUFFIXES = [".local", ".lan", ".home.arpa", ".internal"];

function hostname(host: string): string {
  // "[::1]:3000" -> "::1", "nas.local:3000" -> "nas.local"
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.replace(/:\d+$/, "").toLowerCase();
}

function isIpAddress(name: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(":");
}

export function isAllowedHost(
  host: string,
  extraHosts: string[] = [],
): boolean {
  const name = hostname(host);
  if (!name) return false;
  if (extraHosts.map((h) => hostname(h.trim())).includes(name)) return true;
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (isIpAddress(name)) return true;
  if (!name.includes(".")) return true; // single-label LAN name
  return LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * checkApiRequest() - why to refuse an /api request, or null to allow it
 */
export function checkApiRequest(
  req: {
    method: string;
    host: string | null;
    origin: string | null;
    secFetchSite: string | null;
  },
  extraHosts: string[] = [],
): string | null {
  if (!req.host || !isAllowedHost(req.host, extraHosts)) {
    return "Unknown host. Set WIFI_HEATMAPPER_ALLOWED_HOSTS to allow it.";
  }
  if (req.method === "GET" || req.method === "HEAD") return null;
  if (req.secFetchSite === "cross-site") return "Cross-site request refused.";
  if (req.origin && req.origin !== "null") {
    let originHost = "";
    try {
      originHost = new URL(req.origin).host;
    } catch {
      return "Bad Origin header.";
    }
    if (originHost.toLowerCase() !== req.host.toLowerCase()) {
      return "Cross-origin request refused.";
    }
  } else if (req.origin === "null") {
    return "Cross-origin request refused."; // sandboxed iframe, file://
  }
  return null;
}
