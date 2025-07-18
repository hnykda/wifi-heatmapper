import { expect, test } from "vitest";
import { parseIwOutput } from "../../src/lib/wifiScanner-linux";
import { RSSI_VALUE_ON_LOST_CONNECTION } from "../../src/lib/wifiScanner";

test("parsing iw output", () => {
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
  });
});

test("handle missing signal value", () => {
  const linkOutput = `
Connected to f0:9f:c2:00:00:00 (on wlan0)
	SSID: MyTestNetwork
	freq: 2412
	RX: 12345678 bytes (12345 packets)
	TX: 87654321 bytes (54321 packets)
	signal:
	tx bitrate: 144.4 MBit/s
`;
  const infoOutput = `
Interface wlan0
	ifindex 3
	wdev 0x1
	addr 00:11:22:33:44:55
	type managed
	wiphy 0
	channel 1 (2412 MHz), width: 20 MHz, center1: 2412 MHz
`;
  const result = parseIwOutput(linkOutput, infoOutput);
  expect(result.rssi).toBe(RSSI_VALUE_ON_LOST_CONNECTION);
});
