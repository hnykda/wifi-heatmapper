import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractTcpResults,
  extractUdpFromStreamPath,
  extractUdpFromSumPath,
  extractUdpFromSumReceivedPath,
  extractUdpResults,
  extractIperfResults,
} from "../src/lib/iperfRunner";

// Mock the logger
vi.mock("../src/lib/logger", () => ({
  getLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("TCP result extraction", () => {
  it("should extract bitsPerSecond and retransmits from TCP results", () => {
    const mockTcpResult = {
      end: {
        sum_received: {
          bits_per_second: 100000000,
        },
        sum_sent: {
          retransmits: 5,
        },
      },
    };

    const result = extractTcpResults(mockTcpResult);

    expect(result.bitsPerSecond).toBe(100000000);
    expect(result.retransmits).toBe(5);
  });

  it("should handle missing properties in TCP results", () => {
    const mockTcpResult = {
      end: {
        sum_received: {},
      },
    };

    const result = extractTcpResults(mockTcpResult);

    expect(result.bitsPerSecond).toBeUndefined();
    expect(result.retransmits).toBeUndefined();
  });
});

describe("UDP result extraction", () => {
  it("should extract from streams[0].udp path when available", () => {
    const mockUdpResult = {
      end: {
        streams: [
          {
            udp: {
              bits_per_second: 95000000,
              jitter_ms: 0.5,
              lost_packets: 10,
              packets: 1000,
            },
          },
        ],
      },
    };

    const result = extractUdpFromStreamPath(mockUdpResult);

    expect(result).not.toBeNull();
    expect(result?.bitsPerSecond).toBe(95000000);
    expect(result?.jitterMs).toBe(0.5);
    expect(result?.lostPackets).toBe(10);
    expect(result?.packetsReceived).toBe(1000);
  });

  it("should return null when streams[0].udp path is not available", () => {
    const mockUdpResult = {
      end: {
        streams: [{}],
      },
    };

    const result = extractUdpFromStreamPath(mockUdpResult);

    expect(result).toBeNull();
  });

  it("should extract from sum path when available", () => {
    const mockUdpResult = {
      end: {
        sum: {
          bits_per_second: 95000000,
          jitter_ms: 0.5,
          lost_packets: 10,
          packets: 1000,
        },
      },
    };

    const result = extractUdpFromSumPath(mockUdpResult);

    expect(result).not.toBeNull();
    expect(result?.bitsPerSecond).toBe(95000000);
    expect(result?.jitterMs).toBe(0.5);
    expect(result?.lostPackets).toBe(10);
    expect(result?.packetsReceived).toBe(1000);
  });

  it("should return null when sum path is not available", () => {
    const mockUdpResult = {
      end: {},
    };

    const result = extractUdpFromSumPath(mockUdpResult);

    expect(result).toBeNull();
  });

  it("should extract from sum_received path when available", () => {
    const mockUdpResult = {
      end: {
        sum_received: {
          bits_per_second: 95000000,
        },
      },
    };

    const result = extractUdpFromSumReceivedPath(mockUdpResult);

    expect(result).not.toBeNull();
    expect(result?.bitsPerSecond).toBe(95000000);
  });

  it("should return null when sum_received path is not available", () => {
    const mockUdpResult = {
      end: {
        sum_received: {},
      },
    };

    const result = extractUdpFromSumReceivedPath(mockUdpResult);

    expect(result).toBeNull();
  });

  it("should try multiple paths and return first successful extraction", () => {
    // Only sum path has data
    const mockUdpResult = {
      end: {
        streams: [{}],
        sum: {
          bits_per_second: 95000000,
          jitter_ms: 0.5,
        },
        sum_received: {
          bits_per_second: 90000000,
        },
      },
    };

    const result = extractUdpResults(mockUdpResult);

    expect(result.bitsPerSecond).toBe(95000000);
    expect(result.jitterMs).toBe(0.5);
  });

  it("should handle exceptions during extraction", () => {
    const mockBadResult = {
      end: null, // This will cause an error when trying to access properties
    };

    const result = extractUdpResults(mockBadResult);

    expect(result).toEqual({});
  });
});

describe("Main extraction function", () => {
  it("should call UDP extraction for UDP tests", () => {
    const mockUdpResult = {
      end: {
        streams: [
          {
            udp: {
              bits_per_second: 95000000,
            },
          },
        ],
      },
    };

    const result = extractIperfResults(mockUdpResult, true);

    expect(result.bitsPerSecond).toBe(95000000);
  });

  it("should call TCP extraction for TCP tests", () => {
    const mockTcpResult = {
      end: {
        sum_received: {
          bits_per_second: 100000000,
        },
      },
    };

    const result = extractIperfResults(mockTcpResult, false);

    expect(result.bitsPerSecond).toBe(100000000);
  });

  it("should throw error when no bits_per_second is found", () => {
    const mockEmptyResult = {
      end: {},
    };

    expect(() => {
      extractIperfResults(mockEmptyResult, true);
    }).toThrow("No bits per second value found in iperf result");
  });
});
