import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildDiagnostics,
  buildIssueUrl,
  DiagnosticsInput,
  docsUrl,
  ISSUE_FIELDS,
  ISSUE_TEMPLATE,
  ISSUE_URL_MAX_LENGTH,
  PASTE_HINT,
  RedactionContext,
} from "../src/lib/diagnostics";

function input(overrides: Partial<DiagnosticsInput> = {}): DiagnosticsInput {
  return {
    generatedAt: "2026-10-28T10:00:00.000Z",
    app: {
      version: "0.7.0",
      nodeVersion: "v22.12.0",
      platform: "linux",
      arch: "x64",
      osName: "linux 6.8.0",
      osRelease: "6.8.0",
      runMode: "from source (next start)",
      mockMode: false,
      dataDir: "/home/alice/wifi-heatmapper/data",
    },
    wifi: {
      method: "iw with sudo",
      detail: "iw dev wlp1s0 link; noise not reported",
      at: "2026-10-28T09:59:00.000Z",
      expected: "iw",
      tools: { iw: true, nmcli: false },
    },
    iperf3Version: "iperf 3.16",
    survey: {
      name: "Home.png",
      points: 12,
      speedTests: true,
      iperfServer: "192.168.1.10",
      testDuration: 2,
    },
    lastMeasurement: {
      at: "2026-10-28T09:59:30.000Z",
      ok: false,
      speedTests: true,
      error: "Cannot read Wi-Fi link information.",
    },
    problem: null,
    logLines: [
      '[2026-10-28T09:59:00.000Z] [server-utils:DEBUG] Executing command: echo "hunter2" | sudo -S iw dev wlp1s0 link',
      "[2026-10-28T09:59:01.000Z] [wifiScanner:INFO] active: signalStrength: 70; channel: 36; ssid: Home Net",
      "[2026-10-28T09:59:02.000Z] [iperfRunner:DEBUG] bssid aa:bb:cc:dd:ee:ff server 192.168.1.10",
    ],
    ...overrides,
  };
}

const context: RedactionContext = {
  secrets: ["hunter2"],
  ssids: ["Home Net"],
  bssids: ["aabbccddeeff"],
  hosts: ["192.168.1.10"],
  homeDir: "/home/alice",
  hostname: "alice-laptop",
};

describe("buildDiagnostics", () => {
  test("collects the facts in a readable summary", () => {
    const r = buildDiagnostics(input(), context, { hideNetwork: true });
    expect(r.summary).toContain("App version: 0.7.0");
    expect(r.summary).toContain(
      "Operating system: linux 6.8.0 (linux 6.8.0, x64)",
    );
    expect(r.summary).toContain("Runs as: from source (next start)");
    expect(r.summary).toContain("Node: v22.12.0");
    expect(r.summary).toContain(
      "Wi-Fi reading: iw with sudo (iw dev wlp1s0 link; noise not reported)",
    );
    expect(r.summary).toContain("Wi-Fi tools: iw found, nmcli not found");
    expect(r.summary).toContain("iperf3: iperf 3.16");
    expect(r.summary).toContain(
      "Measuring: Signal and speed (server <ip-1>, 2 s)",
    );
    expect(r.summary).toContain(
      "Last measurement: failed at 2026-10-28T09:59:30.000Z: Cannot read Wi-Fi link information.",
    );
    expect(r.summary).toContain("Data folder: ~/wifi-heatmapper/data");
    expect(r.summary).toContain("Network names and addresses: hidden");
    expect(r.logLineCount).toBe(3);
    expect(r.text).toContain("Recent log (last 3 lines):");
  });

  test("never contains the password; hides the network by default", () => {
    const r = buildDiagnostics(input(), context, { hideNetwork: true });
    const all = JSON.stringify(r);
    expect(all).not.toContain("hunter2");
    expect(all).not.toContain("Home Net");
    expect(all).not.toContain("aa:bb:cc:dd:ee:ff");
    expect(all).not.toContain("192.168.1.10");
    expect(all).not.toContain("/home/alice");
    expect(r.logExcerpt).toContain("echo <password> | sudo -S iw dev");
    expect(r.logExcerpt).toContain("ssid: <ssid-1>");
    expect(r.logExcerpt).toContain("bssid <mac-1> server <ip-1>");
  });

  test("keeps the network when asked, still without the password", () => {
    const r = buildDiagnostics(input(), context, { hideNetwork: false });
    const all = JSON.stringify(r);
    expect(all).not.toContain("hunter2");
    expect(r.text).toContain("Home Net");
    expect(r.text).toContain("192.168.1.10");
    expect(r.summary).toContain("Network names and addresses: included");
  });

  test("before any reading, says what it will try", () => {
    const r = buildDiagnostics(
      input({
        wifi: { method: null, expected: "Windows WLAN API, netsh if it fails" },
        lastMeasurement: null,
        survey: null,
        iperf3Version: null,
      }),
      context,
      { hideNetwork: true },
    );
    expect(r.wifiMethod).toBe(
      "not read yet (expected: Windows WLAN API, netsh if it fails)",
    );
    expect(r.summary).toContain("Last measurement: none since the app started");
    expect(r.summary).toContain("Measuring: unknown (no survey open)");
    expect(r.summary).toContain("iperf3: not installed");
  });

  test("mock mode and signal-only surveys", () => {
    const r = buildDiagnostics(
      input({
        app: { ...input().app, mockMode: true },
        survey: { ...input().survey!, speedTests: false },
      }),
      context,
      { hideNetwork: true },
    );
    expect(r.runMode).toBe("from source (next start), mock mode");
    expect(r.summary).toContain("Measuring: Signal only");
  });

  test("the problem the app showed is included, redacted and one line in the summary", () => {
    const r = buildDiagnostics(
      input({
        problem: "Can't getWifi: echo hunter2 | sudo -S wdutil\nfailed",
      }),
      context,
      { hideNetwork: true },
    );
    expect(r.problem).toBe(
      "Can't getWifi: echo <password> | sudo -S wdutil\nfailed",
    );
    expect(r.summary).toContain(
      "Problem shown: Can't getWifi: echo <password> | sudo -S wdutil failed",
    );
  });
});

describe("buildIssueUrl", () => {
  const report = (overrides: Partial<DiagnosticsInput> = {}) =>
    buildDiagnostics(input(overrides), context, { hideNetwork: true });

  test("prefills the bug report form", () => {
    const { url, complete } = buildIssueUrl(
      report({ problem: "Cannot read Wi-Fi link information." }),
    );
    expect(complete).toBe(true);
    expect(
      url.startsWith(
        "https://github.com/hnykda/wifi-heatmapper/issues/new?template=bug_report.yml&",
      ),
    ).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("title")).toBe(
      "Problem: Cannot read Wi-Fi link information.",
    );
    expect(params.get("version")).toBe("0.7.0");
    expect(params.get("os")).toBe("linux 6.8.0 (linux 6.8.0, x64)");
    expect(params.get("run-mode")).toBe("from source (next start)");
    expect(params.get("wifi-method")).toContain("iw with sudo");
    expect(params.get("what-happened")).toContain(
      "Cannot read Wi-Fi link information.",
    );
    expect(params.get("diagnostics")).toContain("Recent log (last 3 lines):");
    expect(url).not.toContain("hunter2");
    // spaces are %20, not "+", so every form field decodes the same way
    expect(url).not.toContain("+");
  });

  test("without a problem, leaves the title and what happened to the form", () => {
    const params = new URL(buildIssueUrl(report()).url).searchParams;
    expect(params.has("title")).toBe(false);
    expect(params.has("what-happened")).toBe(false);
  });

  test("a long log: summary only, with a request to paste", () => {
    const logLines = Array.from(
      { length: 300 },
      (_, i) =>
        `[2026-10-28T09:00:00.000Z] [root:INFO] line ${i} ${"x".repeat(150)}`,
    );
    const r = report({ logLines });
    const { url, complete } = buildIssueUrl(r);
    expect(complete).toBe(false);
    expect(url.length).toBeLessThanOrEqual(ISSUE_URL_MAX_LENGTH);
    const diagnostics = new URL(url).searchParams.get("diagnostics")!;
    expect(diagnostics).toContain("App version: 0.7.0");
    expect(diagnostics).not.toContain("line 1 ");
    expect(diagnostics.endsWith(PASTE_HINT)).toBe(true);
  });

  test("stays under the limit even with a huge error message", () => {
    const problem = "é ".repeat(5000) + "😀".repeat(500);
    const r = buildDiagnostics(input({ problem, logLines: [] }), context, {
      hideNetwork: true,
    });
    for (const maxLength of [ISSUE_URL_MAX_LENGTH, 3000, 1200]) {
      const { url, complete } = buildIssueUrl(r, { maxLength });
      expect(complete).toBe(false);
      expect(url.length).toBeLessThanOrEqual(maxLength);
      // still a valid URL that names the template and the version
      const params = new URL(url).searchParams;
      expect(params.get("template")).toBe("bug_report.yml");
      expect(params.get("version")).toBe("0.7.0");
    }
  });

  test("exactly at the limit counts as fitting", () => {
    const r = report();
    const full = buildIssueUrl(r, { maxLength: 100_000 }).url;
    expect(buildIssueUrl(r, { maxLength: full.length })).toEqual({
      url: full,
      complete: true,
    });
    expect(buildIssueUrl(r, { maxLength: full.length - 1 }).complete).toBe(
      false,
    );
  });
});

describe("docsUrl", () => {
  test("links the guide section of each tab", () => {
    expect(docsUrl("floorplan")).toBe(
      "https://wifi-heatmapper.danielalder.cz/docs/using-the-app#floor-plan",
    );
    expect(docsUrl("nope")).toBe(
      "https://wifi-heatmapper.danielalder.cz/docs/using-the-app",
    );
  });
});

describe("the issue form", () => {
  test("has every field the link fills in", () => {
    const form = readFileSync(
      `.github/ISSUE_TEMPLATE/${ISSUE_TEMPLATE}`,
      "utf8",
    );
    const ids = [...form.matchAll(/^\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
    for (const id of Object.values(ISSUE_FIELDS)) expect(ids).toContain(id);
    expect(form).toMatch(/id: diagnostics\n(?:.*\n)*?\s+render: text/);
  });
});
