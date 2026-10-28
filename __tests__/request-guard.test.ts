import { describe, expect, test } from "vitest";
import { checkApiRequest, isAllowedHost } from "../src/lib/request-guard";

const post = (headers: {
  host?: string | null;
  origin?: string | null;
  secFetchSite?: string | null;
}) => ({
  method: "POST",
  host: headers.host === undefined ? "localhost:3000" : headers.host,
  origin: headers.origin ?? null,
  secFetchSite: headers.secFetchSite ?? null,
});

describe("isAllowedHost", () => {
  test.each([
    "localhost:3000",
    "127.0.0.1:51234",
    "[::1]:3000",
    "192.168.1.20:3000",
    "nas:3000",
    "raspberrypi.local:3000",
    "router.lan",
    "box.home.arpa:3000",
    "app.localhost:3000",
  ])("allows %s", (host) => expect(isAllowedHost(host)).toBe(true));

  test.each(["evil.example:3000", "attacker.com", "127.0.0.1.nip.io:3000", ""])(
    "refuses %s (DNS rebinding)",
    (host) => expect(isAllowedHost(host)).toBe(false),
  );

  test("WIFI_HEATMAPPER_ALLOWED_HOSTS adds names", () => {
    expect(
      isAllowedHost("heatmap.example.com:3000", ["heatmap.example.com"]),
    ).toBe(true);
  });
});

describe("checkApiRequest", () => {
  test("the app's own pages may change things", () => {
    expect(
      checkApiRequest(
        post({ origin: "http://localhost:3000", secFetchSite: "same-origin" }),
      ),
    ).toBeNull();
  });

  test("tools without an Origin (MCP server, curl) may change things", () => {
    expect(checkApiRequest(post({}))).toBeNull();
  });

  test.each([
    { origin: "https://evil.example" },
    { origin: "http://localhost:3001" },
    { origin: "null" },
    { secFetchSite: "cross-site" },
    { origin: "not a url" },
  ])("refuses cross-site changes %j", (headers) => {
    expect(checkApiRequest(post(headers))).not.toBeNull();
  });

  test("a cross-site GET is allowed (CORS keeps the response unreadable)", () => {
    expect(
      checkApiRequest({
        method: "GET",
        host: "localhost:3000",
        origin: "https://evil.example",
        secFetchSite: "cross-site",
      }),
    ).toBeNull();
  });

  test("an unknown Host is refused even for GET", () => {
    expect(
      checkApiRequest({
        method: "GET",
        host: "evil.example:3000",
        origin: null,
        secFetchSite: null,
      }),
    ).not.toBeNull();
  });
});
