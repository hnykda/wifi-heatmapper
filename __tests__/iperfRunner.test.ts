import { describe, it, expect } from "vitest";
import {
  averageNoise,
  averageRssi,
  extractIperfResults,
  metricFormatter,
  percentageToRssi,
  snrOf,
} from "../src/lib/utils";
import {
  defaultIperfCommands,
  formatArgs,
  iperfArgs,
  iperfArgsProblem,
  migrateIperfTemplate,
  splitArgs,
} from "../src/lib/iperfUtils";

/** The command templates surveys stored before 0.8. */
const OLD_DEFAULT_TEMPLATES = {
  tcpDownload: "iperf3 -c {server} {port} -t {duration} -R -J",
  tcpUpload: "iperf3 -c {server} {port} -t {duration} -J",
  udpDownload: "iperf3 -c {server} {port} -t {duration} -R -u -b 100M -J",
  udpUpload: "iperf3 -c {server} {port} -t {duration} -u -b 100M -J",
};
import fs from "fs";
import path from "path";

// Load the sample test data
const iperfUdpMacResult = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data/iperf_udp_mac.json"), "utf-8"),
);

const iperfUdpUbuntuResult = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data/iperf_udp_ubuntu.json"), "utf-8"),
);

describe("extractIperfResults", () => {
  describe("UDP tests", () => {
    it("should extract data correctly from newer iPerf (Mac) UDP results", () => {
      const result = extractIperfResults(iperfUdpMacResult, true);

      // Test core values are extracted correctly
      expect(result.bitsPerSecond).toBeCloseTo(948249237.17, 0); // Close to 948 Mbps
      expect(result.jitterMs).toBeCloseTo(0.224, 2); // ~0.224 ms jitter - using 2 decimal precision
      expect(result.lostPackets).toBe(16489);
      expect(result.packetsReceived).toBe(82494);

      // These values are specific to UDP tests - retransmits don't apply to UDP
      expect(result.retransmits).toBe(0);
    });

    it("should extract data correctly from older iPerf (Ubuntu) UDP results", () => {
      const result = extractIperfResults(iperfUdpUbuntuResult, true);

      // Test core values are extracted correctly
      expect(result.bitsPerSecond).toBeCloseTo(113095072.39, 0); // Close to 113 Mbps
      expect(result.jitterMs).toBeCloseTo(0.044, 3); // ~0.044 ms jitter
      expect(result.lostPackets).toBe(1826);
      expect(result.packetsReceived).toBe(98179);

      // These values are specific to UDP tests - retransmits don't apply to UDP
      expect(result.retransmits).toBe(0);
    });
  });

  describe("Handling different formats", () => {
    it("should handle newer format (Mac) correctly", () => {
      // For UDP tests with newer format, we should use sum.bits_per_second
      const result = extractIperfResults(iperfUdpMacResult, true);

      // In Mac version for UDP, should get bandwidth from sum (not sum_received)
      expect(result.bitsPerSecond).toBe(
        iperfUdpMacResult.end.sum.bits_per_second,
      );
      expect(result.jitterMs).toBe(iperfUdpMacResult.end.sum.jitter_ms);
    });

    it("should handle older format (Ubuntu) correctly", () => {
      // Verify the older format is handled properly
      const result = extractIperfResults(iperfUdpUbuntuResult, true);

      // In Ubuntu version, everything comes from sum
      expect(result.bitsPerSecond).toBe(
        iperfUdpUbuntuResult.end.sum.bits_per_second,
      );
      expect(result.jitterMs).toBe(iperfUdpUbuntuResult.end.sum.jitter_ms);
    });
  });

  describe("TCP vs UDP handling", () => {
    it("should handle TCP tests with newer format correctly", () => {
      // For TCP tests with newer format, we should use sum_received.bits_per_second
      const tcpResult = extractIperfResults(iperfUdpMacResult, false); // treating as TCP

      // In Mac version for TCP, should get bandwidth from sum_received
      expect(tcpResult.bitsPerSecond).toBe(
        iperfUdpMacResult.end.sum_received.bits_per_second,
      );
      // UDP metrics should be null for TCP tests
      expect(tcpResult.jitterMs).toBeNull();
      expect(tcpResult.lostPackets).toBeNull();
      expect(tcpResult.packetsReceived).toBeNull();
    });

    it("should set UDP-specific fields to null for TCP tests", () => {
      // For a UDP test data, if we tell it's TCP, it should set UDP fields to null
      const result = extractIperfResults(iperfUdpMacResult, false); // false = TCP

      expect(result.bitsPerSecond).toBeDefined(); // Should still extract bandwidth
      expect(result.jitterMs).toBeNull();
      expect(result.lostPackets).toBeNull();
      expect(result.packetsReceived).toBeNull();
    });
  });

  describe("Error handling", () => {
    it("should throw an error if bits_per_second is missing", () => {
      // Create a copy with missing bits_per_second
      const badData = JSON.parse(JSON.stringify(iperfUdpMacResult));
      badData.end.sum_received.bits_per_second = undefined;
      badData.end.sum.bits_per_second = undefined;

      expect(() => extractIperfResults(badData, true)).toThrow(
        "No bits per second found in iperf results",
      );
    });
  });
});

describe("iperfArgs", () => {
  it("builds the TCP download arguments, with the port when given", () => {
    expect(iperfArgs("tcpDownload", "myserver.local", "5201", 3)).toEqual([
      "-c",
      "myserver.local",
      "-p",
      "5201",
      "-t",
      "3",
      "-R",
      "-J",
    ]);
  });

  it("leaves the port out when there is none", () => {
    expect(iperfArgs("tcpUpload", "192.168.1.1", "", 5)).toEqual([
      "-c",
      "192.168.1.1",
      "-t",
      "5",
      "-J",
    ]);
  });

  it("adds -u and the default -b 100M for UDP", () => {
    expect(iperfArgs("udpUpload", "10.0.0.5", "", 5)).toEqual([
      "-c",
      "10.0.0.5",
      "-t",
      "5",
      "-u",
      "-b",
      "100M",
      "-J",
    ]);
  });

  it("puts extra options before -J", () => {
    expect(
      iperfArgs("udpDownload", "h", "", 1, ["-b", "500M", "-P", "2"]),
    ).toEqual([
      "-c",
      "h",
      "-t",
      "1",
      "-R",
      "-u",
      "-b",
      "500M",
      "-P",
      "2",
      "-J",
    ]);
  });

  it("passes a server with shell syntax as one argument", () => {
    const args = iperfArgs("tcpDownload", "x; touch /tmp/pwned", "", 1);
    expect(args[1]).toBe("x; touch /tmp/pwned");
    expect(args).toHaveLength(6);
  });
});

describe("iperfArgsProblem", () => {
  it.each([[[]], [["-P", "4"]], [["-b100M"]], [["--bitrate=1G", "-O", "1"]]])(
    "accepts %j",
    (args) => expect(iperfArgsProblem(args)).toBeNull(),
  );
  it.each([
    [["-c", "other"], /-c/],
    [["-R"], /-R/],
    [["-uR"], /-u/],
    [["--json"], /--json/],
    [["--port=5202"], /--port/],
    [["-t", "30"], /-t/],
    [["a\nb"], /line break/],
  ])("refuses %j", (args, problem) =>
    expect(iperfArgsProblem(args)).toMatch(problem),
  );
});

describe("splitArgs / formatArgs", () => {
  it("splits on spaces and keeps quoted parts together", () => {
    expect(splitArgs(`  -P 4   --title 'my test' -b"1"00M `)).toEqual([
      "-P",
      "4",
      "--title",
      "my test",
      "-b100M",
    ]);
    expect(splitArgs("")).toEqual([]);
    expect(splitArgs('""')).toEqual([""]);
  });

  it("expands nothing", () => {
    expect(splitArgs("$HOME ; | `id`")).toEqual(["$HOME", ";", "|", "`id`"]);
  });

  it("refuses an unclosed quote", () => {
    expect(splitArgs('--title "oops')).toBeNull();
  });

  it("round-trips", () => {
    const args = ["-P", "4", "--title", "my test", 'say "hi"', ""];
    expect(splitArgs(formatArgs(args))).toEqual(args);
  });
});

describe("migrateIperfTemplate (command templates before 0.8)", () => {
  it.each(Object.entries(OLD_DEFAULT_TEMPLATES))(
    "the old default %s becomes the new default",
    (test, template) => {
      expect(migrateIperfTemplate(template)).toEqual({
        args: defaultIperfCommands[test as keyof typeof defaultIperfCommands],
      });
    },
  );

  it("keeps extra options", () => {
    expect(
      migrateIperfTemplate(
        "iperf3 -c {server} {port} -t {duration} -P 4 -O 1 -J",
      ),
    ).toEqual({ args: ["-P", "4", "-O", "1"] });
    expect(
      migrateIperfTemplate(
        "/opt/homebrew/bin/iperf3 -c {server} -t {duration} -u -b 1G -J",
      ),
    ).toEqual({ args: ["-b", "1G"] });
  });

  it.each([
    "iperf3 -c {server} -t {duration} -J; touch /tmp/pwned",
    "iperf3 -c {server} -t {duration} -J | tee /tmp/log",
    "iperf3 -c {server} -t {duration} -J > /tmp/out",
    "iperf3 -c {server} -t $(cat /tmp/d) -J",
    "iperf3 -c {server} -t {duration} --title 'a b' -J",
    "iperf3 -c {server} -t {duration} -J && rm -rf ~",
  ])("refuses shell syntax: %s", (template) => {
    expect(migrateIperfTemplate(template)).toEqual({
      args: null,
      reason: "it contains shell syntax",
    });
  });

  it.each([
    ["curl -c {server}", /runs "curl"/],
    ["iperf3 -c 10.0.0.2 -t {duration} -J", /no \{server\}|sets -c/],
    ["iperf3 -c {server} -p 5300 -t {duration} -J", /sets -p 5300/],
  ])("refuses %s", (template, reason) => {
    const result = migrateIperfTemplate(template);
    expect(result.args).toBeNull();
    expect("reason" in result && result.reason).toMatch(reason);
  });
});

describe("averageRssi", () => {
  it("averages the real dBm readings", () => {
    expect(averageRssi([-50, -55, -61], 70)).toBe(-55);
  });

  it("converts the average percentage if a reading has no RSSI", () => {
    expect(averageRssi([-50, 0, -60], 50)).toBe(percentageToRssi(50));
    expect(averageRssi([], 50)).toBe(percentageToRssi(50));
  });
});

describe("averageNoise", () => {
  it("averages the noise readings", () => {
    expect(averageNoise([-92, -94, -95])).toBe(-94);
  });

  it("ignores readings without noise", () => {
    expect(averageNoise([-90, null, undefined, -94])).toBe(-92);
    expect(averageNoise([0, NaN, -96])).toBe(-96);
  });

  it("is null when no reading had noise", () => {
    expect(averageNoise([])).toBeNull();
    expect(averageNoise([null, undefined, 0])).toBeNull();
  });
});

describe("snrOf", () => {
  it("is RSSI minus noise in dB", () => {
    expect(snrOf({ rssi: -55, noise: -92 })).toBe(37);
    expect(snrOf({ rssi: -88, noise: -91 })).toBe(3);
  });

  it("is null when noise or RSSI is missing", () => {
    expect(snrOf({ rssi: -55 })).toBeNull();
    expect(snrOf({ rssi: -55, noise: null })).toBeNull();
    expect(snrOf({ rssi: -55, noise: 0 })).toBeNull();
    expect(snrOf({ rssi: 0, noise: -92 })).toBeNull();
    expect(snrOf(null)).toBeNull();
  });

  it("is formatted in dB", () => {
    expect(metricFormatter(36.6, "snr")).toBe("37 dB");
  });
});
