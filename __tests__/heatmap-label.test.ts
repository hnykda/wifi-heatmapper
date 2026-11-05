import { describe, expect, it } from "vitest";
import { labelFontSize, pointValueText } from "@/lib/heatmap-label";

describe("heat map reading labels", () => {
  it("formats signal strength in the units of the legend", () => {
    expect(pointValueText(78, "signalStrength", "signalStrength", true)).toBe(
      "78%",
    );
    expect(pointValueText(78, "signalStrength", "signalStrength", false)).toBe(
      "-53 dBm",
    );
  });

  it("formats the other maps in their own units", () => {
    expect(pointValueText(37, "snr", "snr", true)).toBe("37 dB");
    expect(
      pointValueText(312.345e6, "tcpDownload", "bitsPerSecond", true),
    ).toBe("312.35 Mbps");
    expect(pointValueText(1.23456, "udpDownload", "jitterMs", true)).toBe(
      "1.2346 ms",
    );
    expect(pointValueText(12, "tcpDownload", "retransmits", true)).toBe("12");
  });

  it("scales labels with the map and the size setting", () => {
    expect(labelFontSize(13, 75)).toBe(10);
    expect(labelFontSize(40, 75)).toBe(30);
    expect(labelFontSize(13, 40)).toBe(6);
    expect(labelFontSize(13, 160)).toBe(21);
  });
});
