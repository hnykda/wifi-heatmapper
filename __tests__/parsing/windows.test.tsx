import { expect, test, describe, it, beforeAll } from "vitest";
import { parseNetshOutput } from "../../src/lib/wifiScanner-windows";
import { initLocalization } from "../../src/lib/localization";

let reverseLookupTable: Map<string, string>;

beforeAll(async () => {
  reverseLookupTable = await initLocalization(); // build your structure
});

describe("Checking localization code", () => {
  it("should use the preloaded structure", () => {
    expect(reverseLookupTable).toBeDefined();
  });
});

test("parsing netsh output where no labels match", () => {
  const input = `
Interface name : Wi-Fi
There are 1 interfaces on the system:

    Name                   : Wi-Fi
    Description           : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                  : 7825d47a-5d59-4c93-8d91-2b0e1b5f6c4b
    Physical address      : 12:34:56:78:90:ab
    State                 : connected
    X-SSID                  : SomeSSID
    BSSID                 : 12:34:56:78:90:ac
    Network type         : Infrastructure
    Radio type           : 802.11ax
    X-Authentication       : WPA2-Personal
    Cipher               : CCMP
    Connection mode      : Profile
    X-Channel              : 44
    Receive rate (Mbps)  : 103
    X-Transmit rate (Mbps) : 103
    X-Signal             : 42%
    Profile              : SomeProfile

    Hosted network status : Not available
`;

  expect(() => parseNetshOutput(input)).toThrow(
    `Could not read Wi-Fi info. Perhaps wifi-heatmapper is not localized for your system. See https://github.com/hnykda/wifi-heatmapper/issues/26 for details.`,
  );
});

test("parsing english netsh output", () => {
  const input = `
Interface name : Wi-Fi
There are 1 interfaces on the system:

    Name                   : Wi-Fi
    Description           : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                  : 7825d47a-5d59-4c93-8d91-2b0e1b5f6c4b
    Physical address      : 12:34:56:78:90:ab
    State                 : connected
    SSID                  : SomeSSID
    BSSID                 : 12:34:56:78:90:ac
    Network type         : Infrastructure
    Radio type           : 802.11ax
    Authentication       : WPA2-Personal
    Cipher               : CCMP
    Connection mode      : Profile
    Channel              : 44
    Receive rate (Mbps)  : 103
    Transmit rate (Mbps) : 103
    Signal               : 42%
    Profile              : SomeProfile

    Hosted network status : Not available
`;

  const output = parseNetshOutput(input);
  expect(output).toStrictEqual({
    ssid: "SomeSSID",
    bssid: "1234567890ac",
    rssi: -75,
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
    Indirizzo fisico       : 12:34:56:c2:1b:f9
    Stato                  : connessa
    SSID                   : SomeSSID
    BSSID                  : 12:34:56:10:f7:a8
    Tipo di rete           : Infrastruttura
    Tipo frequenza radio   : 802.11n
    Autenticazione         : WPA2-Personal
    Crittografia           : CCMP
    Modalità connessione   : Profilo
    Canale                 : 4
    Velocità ricezione (Mbps)  : 130
    Velocità trasmissione (Mbps) : 130
    Segnale                : 85%
    Profilo                : SomeProfile

    Stato rete ospitata    : Non disponibile
`;

  const output = parseNetshOutput(input);
  expect(output).toStrictEqual({
    ssid: "SomeSSID",
    bssid: "12345610f7a8",
    rssi: -49,
    signalStrength: 85,
    channel: 4,
    band: 2.4, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 130,
    phyMode: "802.11n",
    security: "WPA2-Personal",
  });
});

test("parsing German netsh output", () => {
  const input = `
Es ist 1 Schnittstelle auf dem System vorhanden:

   Name                   : WLAN
   Beschreibung            : Intel(R) Dual Band Wireless-AC 8265
   GUID                   : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Physische Adresse       : 12:34:56:10:f7:a8
   Benutzeroberflächentyp         : Primär
   Status                  : Verbunden
   SSID                   : SomeSSID
   AP BSSID               : 12:34:56:78:90:ab
   Bereich                   : 5 GHz
   Kanal                : 116
   Netzwerktyp            : Infrastruktur
   Funktyp                   : 802.11ac
   Authentifizierung   : WPA2-Enterprise
   Verschlüsselungsverfahren                 : CCMP
   Verbindungsmodus        : Automat. Verbindung
   Empfangsrate (MBit/s)  : 300
   Übertragungsrate (MBit/s) : 300
   Signal              : 43%
   Profil                 : SomeProfile
   QoS MSCS konfiguriert         : 0
   QoS-Zuordnung konfiguriert         : 0
   Durch Richtlinie zugelassene QoS-Zuordnung   :  0

   Status des gehosteten Netzwerks  : Nicht verfügbar
`;

  const output = parseNetshOutput(input);
  expect(output).toStrictEqual({
    ssid: "SomeSSID",
    bssid: "1234567890ab",
    rssi: -74,
    signalStrength: 43,
    channel: 116,
    band: 5, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 300,
    phyMode: "802.11ac",
    security: "WPA2-Enterprise",
  });
});

test("parsing French netsh output", () => {
  const input = `
Il existe 1 interface sur le système :

    Nom                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : f899e530-fd03-44a9-8307-4d4fc4827eab
    Adresse physique       : 12:34:56:78:90:ab
    Type d’interface         : Primaire
    État                  : connecté
    SSID                  : SomeSSID
       Point d'accès d’identificateur SSID (Service Set Identifier)                 : 12:34:56:78:90:ab
    Bande                   : 5 GHz
    Canal                : 144
    Type de réseau           : Infrastructure
    Type de radio             : 802.11ax
    Authentification         : WPA2 - Personnel
    Chiffrement                 : CCMP
    Mode de connexion        : Connexion automatique
    Réception (Mbits/s)    : 310
    Transmission (Mbits/s)   : 310
    Signal                 : 65%
    Profil                : SomeProfile
    QoS MSCS configuré : 0
    Carte QoS configurée : 0
    Mappage QoS autorisé par la stratégie : 0

    État du réseau hébergé: Non disponible
`;

  const output = parseNetshOutput(input);
  expect(output).toStrictEqual({
    ssid: "SomeSSID",
    bssid: "1234567890ab",
    rssi: -61,
    signalStrength: 65,
    channel: 144,
    band: 5, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 310,
    phyMode: "802.11ax",
    security: "WPA2 - Personnel",
  });
});
