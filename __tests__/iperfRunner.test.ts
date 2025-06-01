import { describe, it, expect } from "vitest";
import { extractIperfResults } from "../src/lib/utils";
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
