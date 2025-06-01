import { expect, test } from "vitest";
import { parseNetshOutput } from "../../src/lib/wifiScanner-windows";

test("parsing english netsh output", () => {
  const input = `
Interface name : Wi-Fi
There are 1 interfaces on the system:

    Name                   : Wi-Fi
    Description           : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                  : 7825d47a-5d59-4c93-8d91-2b0e1b5f6c4b
    Physical address      : ba:34:56:78:90:ab
    State                 : connected
    SSID                  : SomeSSID
    BSSID                 : ba:34:56:78:90:ac
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
    bssid: "ba34567890ac",
    rssi: 0,
    signalStrength: 42,
    channel: 44,
    band: 5, // 5GHz since channel is > 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 103,
    phyMode: "802.11ax",
    security: "WPA2-Personal",
  });
});

test("parsing italian netsh output", () => {
  const input = `
Interfacce presenti nel sistema: 1:

    Nome                   : Wi-Fi
    Descrizione            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : e36a6a75-d662-4a6b-9399-f1304b0fe75e
    Indirizzo fisico       : 3c:58:c2:c2:1b:f9
    Stato                  : connessa
    SSID                   : Doddy
    BSSID                  : 24:a5:2c:10:f7:a8
    Tipo di rete           : Infrastruttura
    Tipo frequenza radio   : 802.11n
    Autenticazione         : WPA2-Personal
    Crittografia           : CCMP
    Modalità connessione   : Profilo
    Canale                 : 4
    Velocità ricezione (Mbps)  : 130
    Velocità trasmissione (Mbps) : 130
    Segnale                : 85%
    Profilo                : Doddy

    Stato rete ospitata    : Non disponibile
`;

  const output = parseNetshOutput(input);
  expect(output).toStrictEqual({
    ssid: "Doddy",
    bssid: "24a52c10f7a8",
    rssi: 0,
    signalStrength: 85,
    channel: 4,
    band: 2.4, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 130,
    phyMode: "802.11n",
    security: "WPA2-Personal",
  });
});
