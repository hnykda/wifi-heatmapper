/**
 * Windows WLAN API decoding (src/lib/wlan-api-parse.ts). These run on every
 * platform: the structs are made-up Buffers laid out like the Windows SDK
 * x64 headers (wlanapi.h, windot11.h), and koffi is never loaded.
 */
import { describe, expect, it } from "vitest";
import {
  ERROR_ACCESS_DENIED,
  LIST_HEADER_SIZE,
  WLAN_AVAILABLE_NETWORK_SIZE,
  WLAN_BSS_ENTRY_SIZE,
  WLAN_CONNECTION_ATTRIBUTES_SIZE,
  WLAN_INTERFACE_INFO_SIZE,
  availableNetworkListSize,
  bssEntriesToWifiResults,
  bssListSize,
  connectedFirst,
  connectionToWifiResults,
  decodeAvailableNetworkList,
  decodeBssList,
  decodeConnectionAttributes,
  decodeInterfaceList,
  frequencyToBand,
  frequencyToChannel,
  interfaceListSize,
} from "../src/lib/wlan-api-parse";
import {
  NO_WIFI_ADAPTER_MESSAGE,
  WlanApiError,
  WlanLoadError,
  loadWlanApi,
} from "../src/lib/wlan-api";
import {
  LOCATION_PERMISSION_MESSAGE,
  wlanApiFailureMessage,
} from "../src/lib/wifiScanner-windows";

// ---- builders: write fields at their SDK offsets ----

function writeSsid(buf: Buffer, offset: number, ssid: string) {
  const bytes = Buffer.from(ssid, "utf8");
  buf.writeUInt32LE(bytes.length, offset);
  bytes.copy(buf, offset + 4);
}

function writeMac(buf: Buffer, offset: number, mac: string) {
  Buffer.from(mac, "hex").copy(buf, offset);
}

function interfaceList(
  items: { guidByte: number; description: string; state: number }[],
): Buffer {
  const buf = Buffer.alloc(
    LIST_HEADER_SIZE + items.length * WLAN_INTERFACE_INFO_SIZE,
  );
  buf.writeUInt32LE(items.length, 0); // dwNumberOfItems
  buf.writeUInt32LE(0, 4); // dwIndex
  items.forEach((item, i) => {
    const o = LIST_HEADER_SIZE + i * WLAN_INTERFACE_INFO_SIZE;
    buf.fill(item.guidByte, o, o + 16); // InterfaceGuid
    buf.write(item.description, o + 16, "utf16le"); // WCHAR[256]
    buf.writeInt32LE(item.state, o + 528); // isState
  });
  return buf;
}

interface BssSpec {
  ssid: string;
  bssid: string;
  phyType: number;
  rssi: number;
  linkQuality: number;
  freqKHz: number;
}

function bssList(entries: BssSpec[]): Buffer {
  const total = LIST_HEADER_SIZE + entries.length * WLAN_BSS_ENTRY_SIZE;
  const buf = Buffer.alloc(total);
  buf.writeUInt32LE(total, 0); // dwTotalSize
  buf.writeUInt32LE(entries.length, 4); // dwNumberOfItems
  entries.forEach((e, i) => {
    const o = LIST_HEADER_SIZE + i * WLAN_BSS_ENTRY_SIZE;
    writeSsid(buf, o, e.ssid); // dot11Ssid
    buf.writeUInt32LE(0, o + 36); // uPhyId
    writeMac(buf, o + 40, e.bssid); // dot11Bssid
    buf.writeInt32LE(1, o + 48); // dot11BssType: infrastructure
    buf.writeInt32LE(e.phyType, o + 52); // dot11BssPhyType
    buf.writeInt32LE(e.rssi, o + 56); // lRssi
    buf.writeUInt32LE(e.linkQuality, o + 60); // uLinkQuality
    buf.writeUInt16LE(100, o + 66); // usBeaconPeriod
    buf.writeBigUInt64LE(123456789n, o + 72); // ullTimestamp
    buf.writeUInt32LE(e.freqKHz, o + 92); // ulChCenterFrequency
  });
  return buf;
}

function availableList(
  nets: { ssid: string; auth: number; quality: number }[],
): Buffer {
  const buf = Buffer.alloc(
    LIST_HEADER_SIZE + nets.length * WLAN_AVAILABLE_NETWORK_SIZE,
  );
  buf.writeUInt32LE(nets.length, 0);
  nets.forEach((n, i) => {
    const o = LIST_HEADER_SIZE + i * WLAN_AVAILABLE_NETWORK_SIZE;
    writeSsid(buf, o + 512, n.ssid); // dot11Ssid
    buf.writeInt32LE(1, o + 548); // dot11BssType
    buf.writeUInt32LE(n.quality, o + 604); // wlanSignalQuality
    buf.writeInt32LE(n.auth === 1 ? 0 : 1, o + 608); // bSecurityEnabled
    buf.writeInt32LE(n.auth, o + 612); // dot11DefaultAuthAlgorithm
  });
  return buf;
}

function connectionAttributes(): Buffer {
  const buf = Buffer.alloc(WLAN_CONNECTION_ATTRIBUTES_SIZE);
  buf.writeInt32LE(1, 0); // isState: connected
  buf.writeInt32LE(0, 4); // wlanConnectionMode: profile
  buf.write("Home profile", 8, "utf16le"); // strProfileName
  writeSsid(buf, 520, "Café Wi-Fi"); // dot11Ssid (UTF-8)
  buf.writeInt32LE(1, 556); // dot11BssType
  writeMac(buf, 560, "a0b1c2d3e4f5"); // dot11Bssid
  buf.writeInt32LE(10, 568); // dot11PhyType: HE
  buf.writeUInt32LE(0, 572); // uDot11PhyIndex
  buf.writeUInt32LE(83, 576); // wlanSignalQuality
  buf.writeUInt32LE(960000, 580); // ulRxRate (kbps)
  buf.writeUInt32LE(1201000, 584); // ulTxRate (kbps)
  buf.writeInt32LE(1, 588); // bSecurityEnabled
  buf.writeInt32LE(0, 592); // bOneXEnabled
  buf.writeInt32LE(9, 596); // dot11AuthAlgorithm: WPA3-SAE
  buf.writeInt32LE(4, 600); // dot11CipherAlgorithm: CCMP
  return buf;
}

// ---- tests ----

describe("struct sizes match the Windows SDK", () => {
  it("uses the documented sizeof values", () => {
    expect(WLAN_INTERFACE_INFO_SIZE).toBe(532);
    expect(WLAN_BSS_ENTRY_SIZE).toBe(360);
    expect(WLAN_AVAILABLE_NETWORK_SIZE).toBe(628);
    expect(WLAN_CONNECTION_ATTRIBUTES_SIZE).toBe(604);
  });

  it("computes how much of each list to copy from its header", () => {
    expect(interfaceListSize(interfaceList([]))).toBe(8);
    const two = interfaceList([
      { guidByte: 1, description: "a", state: 0 },
      { guidByte: 2, description: "b", state: 1 },
    ]);
    expect(interfaceListSize(two)).toBe(two.length);
    const bss = bssList([
      {
        ssid: "x",
        bssid: "000000000001",
        phyType: 7,
        rssi: -50,
        linkQuality: 80,
        freqKHz: 2412000,
      },
    ]);
    expect(bssListSize(bss)).toBe(bss.length);
    const avail = availableList([{ ssid: "x", auth: 7, quality: 50 }]);
    expect(availableNetworkListSize(avail)).toBe(avail.length);
  });
});

describe("interfaces", () => {
  const list = decodeInterfaceList(
    interfaceList([
      { guidByte: 0x11, description: "USB Wi-Fi dongle", state: 0 },
      { guidByte: 0x22, description: "Intel(R) Wi-Fi 6E AX211", state: 1 },
    ]),
  );

  it("decodes GUID, description and state", () => {
    expect(list).toHaveLength(2);
    expect(list[0].guid).toEqual(Buffer.alloc(16, 0x11));
    expect(list[0].description).toBe("USB Wi-Fi dongle");
    expect(list[1].description).toBe("Intel(R) Wi-Fi 6E AX211");
    expect(list[1].state).toBe(1);
  });

  it("tries the connected interface first, not the first one", () => {
    const ordered = connectedFirst(list);
    expect(ordered[0].description).toBe("Intel(R) Wi-Fi 6E AX211");
    expect(ordered).toHaveLength(2);
  });

  it("decodes an empty list", () => {
    expect(decodeInterfaceList(interfaceList([]))).toEqual([]);
  });
});

describe("frequency to band and channel", () => {
  it.each([
    [2412000, 2.4, 1],
    [2437000, 2.4, 6],
    [2484000, 2.4, 14],
    [5180000, 5, 36],
    [5825000, 5, 165],
    [5885000, 5, 177],
    [5935000, 6, 2],
    [5955000, 6, 1],
    [6115000, 6, 33],
    [7115000, 6, 233],
    [0, 0, 0],
  ])("%i kHz is %s GHz channel %i", (freq, band, channel) => {
    expect(frequencyToBand(freq)).toBe(band);
    expect(frequencyToChannel(freq)).toBe(channel);
  });
});

describe("scan results", () => {
  const entries = decodeBssList(
    bssList([
      {
        ssid: "Home",
        bssid: "a0b1c2d3e4f5",
        phyType: 10,
        rssi: -48,
        linkQuality: 87,
        freqKHz: 6115000, // 6 GHz channel 33
      },
      {
        ssid: "Home",
        bssid: "a0b1c2d3e4f4",
        phyType: 7,
        rssi: -60,
        linkQuality: 67,
        freqKHz: 2437000,
      },
      {
        ssid: "",
        bssid: "112233445566",
        phyType: 8,
        rssi: -70,
        linkQuality: 50,
        freqKHz: 5180000,
      },
      {
        ssid: "Neighbour",
        bssid: "665544332211",
        phyType: 8,
        rssi: -82,
        linkQuality: 30,
        freqKHz: 5500000,
      },
    ]),
  );
  const available = decodeAvailableNetworkList(
    availableList([
      { ssid: "Neighbour", auth: 7, quality: 30 },
      { ssid: "Home", auth: 9, quality: 87 },
    ]),
  );

  it("decodes BSS entries", () => {
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({
      ssid: "Home",
      bssid: "a0b1c2d3e4f5",
      rssi: -48,
      linkQuality: 87,
      phyType: 10,
      centerFrequencyKHz: 6115000,
    });
  });

  it("decodes available networks", () => {
    expect(available[1]).toMatchObject({
      ssid: "Home",
      authAlgorithm: 9,
      securityEnabled: true,
      signalQuality: 87,
    });
  });

  it("maps to WifiResults: real RSSI, band from frequency, security per SSID", () => {
    const results = bssEntriesToWifiResults(entries, available, "a0b1c2d3e4f5");
    expect(results.map((r) => r.bssid)).toEqual([
      "a0b1c2d3e4f5",
      "a0b1c2d3e4f4",
      "665544332211",
    ]); // strongest first, hidden network dropped
    expect(results[0]).toMatchObject({
      ssid: "Home",
      rssi: -48,
      signalStrength: 87,
      channel: 33,
      band: 6, // not 5: channel 33 is a 6 GHz channel here
      phyMode: "802.11ax",
      security: "WPA3-Personal",
      currentSSID: true,
    });
    expect(results[1]).toMatchObject({ band: 2.4, channel: 6 });
    expect(results[1].currentSSID).toBe(false);
    expect(results[2]).toMatchObject({
      band: 5,
      channel: 100,
      security: "WPA2-Personal",
    });
  });

  it("leaves security empty when the network is not in the available list", () => {
    const results = bssEntriesToWifiResults(entries, []);
    expect(results.every((r) => r.security === "")).toBe(true);
    expect(results.every((r) => !r.currentSSID)).toBe(true);
  });
});

describe("current connection", () => {
  const conn = decodeConnectionAttributes(connectionAttributes());

  it("decodes WLAN_CONNECTION_ATTRIBUTES", () => {
    expect(conn).toMatchObject({
      state: 1,
      profileName: "Home profile",
      ssid: "Café Wi-Fi",
      bssid: "a0b1c2d3e4f5",
      phyType: 10,
      signalQuality: 83,
      txRateKbps: 1201000,
      securityEnabled: true,
      authAlgorithm: 9,
    });
  });

  it("takes channel and band from the BSS frequency when it has one", () => {
    const [bss] = decodeBssList(
      bssList([
        {
          ssid: "Café Wi-Fi",
          bssid: "a0b1c2d3e4f5",
          phyType: 10,
          rssi: -55,
          linkQuality: 83,
          freqKHz: 5955000, // 6 GHz channel 1
        },
      ]),
    );
    const wifi = connectionToWifiResults(conn, -52, 1, bss);
    expect(wifi).toMatchObject({
      ssid: "Café Wi-Fi",
      bssid: "a0b1c2d3e4f5",
      rssi: -52, // from the rssi opcode, not converted from %
      signalStrength: 83,
      channel: 1,
      band: 6,
      txRate: 1201,
      phyMode: "802.11ax",
      security: "WPA3-Personal",
      currentSSID: true,
    });
  });

  it("falls back to the channel opcode without a BSS entry", () => {
    expect(connectionToWifiResults(conn, -60, 44)).toMatchObject({
      channel: 44,
      band: 5,
      rssi: -60,
    });
    expect(connectionToWifiResults(conn, -60, 11).band).toBe(2.4);
  });
});

describe("errors", () => {
  it("access denied means Windows location permission is off", () => {
    expect(
      wlanApiFailureMessage(
        new WlanApiError("WlanGetNetworkBssList", ERROR_ACCESS_DENIED),
      ),
    ).toBe(LOCATION_PERMISSION_MESSAGE);
    expect(
      wlanApiFailureMessage(
        new WlanApiError("WlanQueryInterface", ERROR_ACCESS_DENIED),
      ),
    ).toBe(LOCATION_PERMISSION_MESSAGE);
  });

  it("the location message tells the user where to go", () => {
    expect(LOCATION_PERMISSION_MESSAGE).toContain("Privacy & security");
    expect(LOCATION_PERMISSION_MESSAGE).toContain(
      "Let desktop apps access your location",
    );
  });

  it("no adapter is not a bug", () => {
    expect(wlanApiFailureMessage(new Error(NO_WIFI_ADAPTER_MESSAGE))).toBe(
      NO_WIFI_ADAPTER_MESSAGE,
    );
  });

  it("other failures say what failed and ask for a report", () => {
    const apiError = wlanApiFailureMessage(new WlanApiError("WlanScan", 1062));
    expect(apiError).toContain(
      "Can't read Wi-Fi through the Windows WLAN API (WlanScan failed with error 1062)",
    );
    expect(apiError).toContain("Report a problem");

    const loadError = wlanApiFailureMessage(
      new WlanLoadError(new Error("Cannot find module 'koffi'")),
    );
    expect(loadError).toContain(
      "(koffi could not load wlanapi.dll: Cannot find module 'koffi')",
    );
    expect(loadError).toContain("Report a problem");
  });

  it.skipIf(process.platform === "win32")(
    "never loads koffi off Windows",
    async () => {
      await expect(loadWlanApi()).rejects.toThrow("only available on Windows");
    },
  );
});
