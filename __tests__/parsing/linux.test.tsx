import { expect, test } from "vitest";
import { parseIwOutput } from "../../src/lib/wifiScanner-linux";

test("parsing netsh output", () => {
  const linkOutput = `
Connected to 12:34:56:3f:19:7c (on wlan0)
SSID: HomeNetwork_5G
freq: 5180
RX: 780.0 Mbps
TX: 866.7 Mbps
signal: -56 dBm
tx bitrate: 866.7 MBit/s
rx bitrate: 780.0 MBit/s
`;

  const infoOutput = `
  Interface wlan0
	type: managed
	wiphy: 0
	channel 36 (5180 MHz), width: 80 MHz, center1: 5210 MHz
  `;

  const output = parseIwOutput(linkOutput, infoOutput);
  expect(output).toStrictEqual({
    ssid: "HomeNetwork_5G",
    bssid: "1234563f197c",
    rssi: -56,
    channel: 36,
    signalStrength: 73,
    band: 5.18,
    channelWidth: 80,
    txRate: 866.7,
    phyMode: "",
    security: "",
    active: false,
  });
});
