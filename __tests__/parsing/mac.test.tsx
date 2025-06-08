import { expect, test } from "vitest";
import { parseWdutilOutput } from "../../src/lib/wifiScanner-macos";

test("parsing macOS 15 (Sequoia) wdutil output", () => {
  const input = `
————————————————————————————————————————————————————————————————————
NETWORK
————————————————————————————————————————————————————————————————————
...
————————————————————————————————————————————————————————————————————
WIFI
————————————————————————————————————————————————————————————————————
    MAC Address          : FE:DC:AB:09:87:65 (hw=FE:DC:AB:09:87:65)
    Interface Name       : en0
    Power                : On [On]
    Op Mode              : STA
    SSID                 : SomeSSID
    BSSID                : FE:DC:AB:09:87:65
    RSSI                 : -79 dBm
    CCA                  : 16 %
    Noise                : -91 dBm
    Tx Rate              : 103.0 Mbps
    Security             : WPA2 Personal
    PHY Mode             : 11ax
    MCS Index            : 2
    Guard Interval       : 1600
    NSS                  : 2
    Channel              : 5g44/40
    Country Code         : CZ
    Scan Cache Count     : 2
    NetworkServiceID     : 36455631-2A6F-48BC-AD49-1F131B034DCE
    IPv4 Config Method   : DHCP
    IPv4 Address         : 192.168.0.133
    IPv4 Router          : 192.168.0.1
    IPv6 Config Method   : Automatic
    IPv6 Address         : 1b03:6430:15:2:1cd4:75a0:davd:5074
    IPv6 Router          : fe80::1e3b:f3ff:fe8e:8b60
    DNS                  : 192.168.0.1
                         : fd49:e5fc:83af::1
    BTC Mode             : Off
    Desense              : 
    Chain Ack            : []
    BTC Profile 2.4GHz   : Disabled
    BTC Profile 5GHz     : Disabled
    Sniffer Supported    : YES
    Supports 6e          : No
    Supported Channels   : 2g1/20,2g2/20,2g3/20,2g4/20,2g5/20,2g6/20,2g7/20,2g8/20,2g9/20,2g10/20,2g11/20,2g12/20,2g13/20,5g36/20,5g40/20,5g44/20,5g48/20,5g52/20,5g56/20,5g60/20,5g64/20,5g100/20,5g104/20,5g108/20,5g112/20,5g116/20,5g120/20,5g124/20,5g128/20,5g132/20,5g136/20,5g140/20,5g149/20,5g153/20,5g157/20,5g161/20,5g165/20,5g36/40,5g40/40,5g44/40,5g48/40,5g52/40,5g56/40,5g60/40,5g64/40,5g100/40,5g104/40,5g108/40,5g112/40,5g116/40,5g120/40,5g124/40,5g128/40,5g132/40,5g136/40,5g149/40,5g153/40,5g157/40,5g161/40,5g36/80,5g40/80,5g44/80,5g48/80,5g52/80,5g56/80,5g60/80,5g64/80,5g100/80,5g104/80,5g108/80,5g112/80,5g116/80,5g120/80,5g124/80,5g128/80,5g149/80,5g153/80,5g157/80,5g161/80
————————————————————————————————————————————————————————————————————
BLUETOOTH
————————————————————————————————————————————————————————————————————
...

————————————————————————————————————————————————————————————————————
AWDL
————————————————————————————————————————————————————————————————————
...
————————————————————————————————————————————————————————————————————
POWER
————————————————————————————————————————————————————————————————————
  `;
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    bssid: "fedcab098765",
    channel: 44,
    channelWidth: 40,
    band: 5,
    phyMode: "11ax",
    rssi: -79,
    signalStrength: 0,
    security: "WPA2 Personal",
    ssid: "SomeSSID",
    txRate: 103,
  });
});

test("parsing macOS 12 (Catalina) 2.4GHz wdutil output", () => {
  const input = `
————————————————————————————————————————————————————————————————————
NETWORK
————————————————————————————————————————————————————————————————————
    Primary IPv4         : en1 (Wi-Fi / F5D60FB0-4E86-4E30-801D-B4A3C4893961)
                         : 192.168.253.190
    Primary IPv6         : en1 (Wi-Fi / F5D60FB0-4E86-4E30-801D-B4A3C4893961)
                         : fd7e:5a1e:b4b3:0:4f2:74be:8f2a:83c3
                         : fd7e:5a1e:b4b3:0:91a7:bb9f:e00b:67b4
                         : fd7e:5a1e:b4b3::37a
    DNS Addresses        : 192.168.253.1
                         : fd7e:5a1e:b4b3::1
    Apple                : Reachable
————————————————————————————————————————————————————————————————————
WIFI
————————————————————————————————————————————————————————————————————
    MAC Address          : fe:dc:ba:09:87:65
    Interface Name       : en1
    Power                : On [On,On]
    Op Mode              : STA
    SSID                 : SomeSSID-2.4
    BSSID                : fe:dc:ba:09:87:65
    RSSI                 : -55 dBm
    Noise                : -98 dBm
    Tx Rate              : 145.0 Mbps
    Security             : None
    PHY Mode             : 11n
    MCS Index            : 15
    Guard Interval       : 800
    NSS                  : 2
    Channel              : 1 (20 MHz, Active)
    Country Code         : US
    Scan Cache Count     : 10
    NetworkServiceID     : F5D60FB0-4E86-4E30-801D-B4A3C4893961
    IPv4 Config Method   : DHCP
    IPv4 Address         : 192.168.253.190
    IPv4 Router          : 192.168.253.1
    IPv6 Config Method   : Automatic
    IPv6 Address         : fd7e:5a1e:b4b3:0:4f2:74be:8f2a:83c3
                         : fd7e:5a1e:b4b3:0:91a7:bb9f:e00b:67b4
                         : fd7e:5a1e:b4b3::37a
    IPv6 Router          : fe80::ea9f:80ff:fee3:c18d
    DNS                  : 192.168.253.1
                         : fd7e:5a1e:b4b3::1
    BTC Mode             : Off
    Desense              : None
    Chain Ack            : [Off,Off]
    Tx Power [0]         : On
    Tx Power [1]         : On
    BTC Profile 2.4GHz   : Enabled
    BTC Profile 5GHz     : Enabled
————————————————————————————————————————————————————————————————————
BLUETOOTH
————————————————————————————————————————————————————————————————————
    ...
————————————————————————————————————————————————————————————————————
AWDL
————————————————————————————————————————————————————————————————————
    ...
————————————————————————————————————————————————————————————————————
POWER
————————————————————————————————————————————————————————————————————
    ...
  `;
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    bssid: "fedcba098765",
    channel: 1,
    channelWidth: 20,
    band: 2.4,
    phyMode: "11n",
    rssi: -55,
    signalStrength: 0,
    security: "None",
    ssid: "SomeSSID-2.4",
    txRate: 145.0,
  });
});

test("parsing macOS 12 (Catalina) 5GHz wdutil output", () => {
  const input = `
————————————————————————————————————————————————————————————————————
NETWORK
————————————————————————————————————————————————————————————————————
    Primary IPv4         : en1 (Wi-Fi / F5D60FB0-4E86-4E30-801D-B4A3C4893961)
                         : 192.168.253.190
    Primary IPv6         : en1 (Wi-Fi / F5D60FB0-4E86-4E30-801D-B4A3C4893961)
                         : fd7e:5a1e:b4b3:0:4f2:74be:8f2a:83c3
                         : fd7e:5a1e:b4b3:0:ec4e:ee46:a6eb:87b1
                         : fd7e:5a1e:b4b3::37a
    DNS Addresses        : 192.168.253.1
                         : fd7e:5a1e:b4b3::1
    Apple                : Reachable
————————————————————————————————————————————————————————————————————
WIFI
————————————————————————————————————————————————————————————————————
    MAC Address          : fe:dc:ba:09:87:65
    Interface Name       : en1
    Power                : On [On,On]
    Op Mode              : STA
    SSID                 : SomeSSID-5
    BSSID                : fe:dc:ba:09:87:65
    RSSI                 : -61 dBm
    Noise                : -96 dBm
    Tx Rate              : 324.0 Mbps
    Security             : WPA2 Personal
    PHY Mode             : 11ac
    MCS Index            : 8
    Guard Interval       : 800
    NSS                  : 2
    Channel              : 144 (40 MHz, DFS)
    Country Code         : US
    Scan Cache Count     : 8
    NetworkServiceID     : F5D60FB0-4E86-4E30-801D-B4A3C4893961
    IPv4 Config Method   : DHCP
    IPv4 Address         : 192.168.253.190
    IPv4 Router          : 192.168.253.1
    IPv6 Config Method   : Automatic
    IPv6 Address         : fd7e:5a1e:b4b3:0:4f2:74be:8f2a:83c3
                         : fd7e:5a1e:b4b3:0:ec4e:ee46:a6eb:87b1
                         : fd7e:5a1e:b4b3::37a
    IPv6 Router          : fe80::ea9f:80ff:fee3:c18d
    DNS                  : 192.168.253.1
                         : fd7e:5a1e:b4b3::1
    BTC Mode             : Off
    Desense              : None
    Chain Ack            : [Off,Off]
    Tx Power [0]         : On
    Tx Power [1]         : On
    BTC Profile 2.4GHz   : Enabled
    BTC Profile 5GHz     : Enabled
————————————————————————————————————————————————————————————————————
BLUETOOTH
————————————————————————————————————————————————————————————————————
    ...
————————————————————————————————————————————————————————————————————
AWDL
————————————————————————————————————————————————————————————————————
    ...
————————————————————————————————————————————————————————————————————
POWER
————————————————————————————————————————————————————————————————————
    ...
  `;
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    bssid: "fedcba098765",
    channel: 144,
    channelWidth: 40,
    band: 5,
    phyMode: "11ac",
    rssi: -61,
    signalStrength: 0,
    security: "WPA2 Personal",
    ssid: "SomeSSID-5",
    txRate: 324.0,
  });
});
