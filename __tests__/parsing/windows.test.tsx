import { expect, test } from "vitest";
import { parseNetshOutput } from "../../src/lib/wifiScanner";

test("parsing netsh output", () => {
  const input = `
Interface name : Wi-Fi
There are 1 interfaces on the system:

    Name                   : Wi-Fi
    Description           : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                  : 7825d47a-5d59-4c93-8d91-2b0e1b5f6c4b
    Physical address      : ba:34:56:78:90:ab
    State                 : connected
    SSID                  : SomeSSID
    BSSID                 : bs:34:56:78:90:ac
    Network type         : Infrastructure
    Radio type           : 802.11ax
    Authentication       : WPA2-Personal
    Cipher               : CCMP
    Connection mode      : Profile
    Channel              : 44
    Receive rate (Mbps)  : 103
    Transmit rate (Mbps) : 103
    Signal               : 42%
    Profile              : SomeSSID

    Hosted network status : Not available
`;

  const output = parseNetshOutput(input);
  expect(output).toStrictEqual({
    ssid: "SomeSSID",
    bssid: "bs34567890ac",
    rssi: 0,
    signalStrength: 42,
    channel: 44,
    frequency: 5, // 5GHz since channel is > 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 103,
    phyMode: "802.11ax",
    security: "WPA2-Personal"
  });
}); 