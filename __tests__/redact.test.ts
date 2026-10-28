import { describe, expect, test } from "vitest";
import { createRedactor, hideSudoPassword } from "../src/lib/redact";

describe("hideSudoPassword", () => {
  test.each([
    [
      "echo hunter2 | sudo -S wdutil info",
      "echo <password> | sudo -S wdutil info",
    ],
    [
      'echo "hunter2" | sudo -S iw dev wlan0 link',
      "echo <password> | sudo -S iw dev wlan0 link",
    ],
    ["echo 'p a s s' |sudo -S ls", "echo <password> | sudo -S ls"],
    // a password with a pipe in it
    ["echo a|b | sudo -S ls", "echo <password> | sudo -S ls"],
    [
      'Command failed: echo "s3cr3t" | sudo -S iw dev wlp1s0 survey dump\nsudo: 1 incorrect password attempt',
      "Command failed: echo <password> | sudo -S iw dev wlp1s0 survey dump\nsudo: 1 incorrect password attempt",
    ],
  ])("%s", (input, expected) => {
    expect(hideSudoPassword(input)).toBe(expected);
  });

  test("leaves other echo commands alone", () => {
    expect(hideSudoPassword("echo hello")).toBe("echo hello");
    expect(hideSudoPassword("echo hi | grep h")).toBe("echo hi | grep h");
  });

  test("handles several on one line and across lines", () => {
    const out = hideSudoPassword(
      "echo one | sudo -S ls; echo two | sudo -S ls\necho three | sudo -S ls",
    );
    expect(out).not.toMatch(/one|two|three/);
  });
});

describe("createRedactor: always", () => {
  const redact = createRedactor({
    secrets: ["hunter2", "x"],
    hideNetwork: false,
    homeDir: "/Users/alice",
  });

  test("removes known secrets anywhere", () => {
    expect(redact('{"sudoerPassword":"hunter2"} and hunter2 again')).toBe(
      '{"sudoerPassword":"<password>"} and <password> again',
    );
  });

  test("ignores secrets too short to replace safely", () => {
    expect(redact("x marks the spot")).toBe("x marks the spot");
  });

  test("removes the sudo password from command lines even if unknown", () => {
    expect(redact("echo letmein | sudo -S wdutil info")).toBe(
      "echo <password> | sudo -S wdutil info",
    );
  });

  test("shortens the home folder", () => {
    expect(redact("data in /Users/alice/Library/x")).toBe(
      "data in ~/Library/x",
    );
  });

  test("keeps network details when asked to", () => {
    const text = "ssid: Home; bssid aa:bb:cc:dd:ee:ff at 192.168.1.10";
    expect(redact(text)).toBe(text);
  });
});

describe("createRedactor: network details", () => {
  const make = (extra: Partial<Parameters<typeof createRedactor>[0]> = {}) =>
    createRedactor({ hideNetwork: true, ...extra });

  test("MAC addresses in every spelling, same placeholder for the same one", () => {
    const redact = make();
    expect(
      redact(
        "aa:bb:cc:dd:ee:ff AA-BB-CC-DD-EE-FF aabbccddeeff 11:22:33:44:55:66",
      ),
    ).toBe("<mac-1> <mac-1> <mac-1> <mac-2>");
  });

  test("nmcli's escaped colons", () => {
    expect(make()("*:AA\\:BB\\:CC\\:DD\\:EE\\:01:Infra")).toBe(
      "*:<mac-1>:Infra",
    );
    // an SSID that starts with hex letters right after it
    expect(make()("*:AA\\:BB\\:CC\\:DD\\:EE\\:01:Cafe:Infra")).toBe(
      "*:<mac-1>:Cafe:Infra",
    );
  });

  test("not part of a longer run of octets", () => {
    const text = "id 00:11:22:33:44:55:66:77";
    expect(make()(text)).not.toContain("<mac-");
  });

  test("plain 12-digit numbers are not MAC addresses", () => {
    expect(make()("took 123456789012 bits")).toBe("took 123456789012 bits");
  });

  test("UUID tails and longer hex strings are left alone", () => {
    const text =
      "id 123e4567-e89b-12d3-a456-426614174000 hash 0123456789abcdef0123";
    expect(make()(text)).toBe(text);
  });

  test("known BSSIDs in other spellings", () => {
    const redact = make({ bssids: ["9e05d696e830"] });
    expect(redact("bssid 9E.05.D6.96.E8.30")).toBe("bssid <mac-1>");
  });

  test("IPv4 addresses, but not loopback, versions or masks", () => {
    const redact = make();
    expect(
      redact(
        "server 192.168.1.10:5201, me 10.0.0.2, again 192.168.1.10, local 127.0.0.1, any 0.0.0.0, mask 255.255.255.0",
      ),
    ).toBe(
      "server <ip-1>:5201, me <ip-2>, again <ip-1>, local 127.0.0.1, any 0.0.0.0, mask 255.255.255.0",
    );
    expect(redact("Windows 10.0.26100.1234, iperf 3.17.1")).toBe(
      "Windows 10.0.26100.1234, iperf 3.17.1",
    );
  });

  test("IPv6 addresses, but not ::1 or times", () => {
    const redact = make();
    expect(
      redact("fe80::1c2b:3a4d:5e6f:7a8b%en0 2001:db8::1 ::1 at 12:34:56"),
    ).toBe("<ip-1>%en0 <ip-2> ::1 at 12:34:56");
    expect(redact("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("<ip-3>");
  });

  test("timestamps survive", () => {
    const line = "[2026-10-28T12:34:56.789Z] [root:INFO] started";
    expect(make()(line)).toBe(line);
  });

  test("SSIDs after a label, in log, netsh, iw and wdutil formats", () => {
    const redact = make();
    expect(
      redact(
        [
          "active: signalStrength: 80; channel: 36; ssid: My Home Net",
          "    SSID                   : My Home Net",
          "SSID 2 : Neighbours 5G",
          "\tSSID: Cafe",
          '{"ssid":"My Home Net","bssid":"aabbccddee01","currentSSID":true}',
        ].join("\n"),
      ),
    ).toBe(
      [
        "active: signalStrength: 80; channel: 36; ssid: <ssid-1>",
        "    SSID                   : <ssid-1>",
        "SSID 2 : <ssid-2>",
        "\tSSID: <ssid-3>",
        '{"ssid":"<ssid-1>","bssid":"<mac-1>","currentSSID":true}',
      ].join("\n"),
    );
  });

  test("SSIDs found after a label are hidden elsewhere too", () => {
    expect(make()("ssid: Skynet\nMeasuring Wi-Fi (Skynet)")).toBe(
      "ssid: <ssid-1>\nMeasuring Wi-Fi (<ssid-1>)",
    );
  });

  test("known SSIDs without a label (nmcli)", () => {
    const redact = make({ ssids: ["Office Wi-Fi", "Demo"] });
    expect(redact("*:<x>:Office Wi-Fi:Infra:44 and Demo")).toBe(
      "*:<x>:<ssid-1>:Infra:44 and <ssid-2>",
    );
  });

  test("short or placeholder SSIDs are not replaced as plain words", () => {
    const redact = make({ ssids: ["AP", "<redacted>", ""] });
    expect(redact("AP name <redacted> ssid: <redacted>")).toBe(
      "AP name <redacted> ssid: <redacted>",
    );
    // but after a label they are
    expect(redact("ssid: AP")).toBe("ssid: <ssid-1>");
  });

  test("SSIDs with regex characters", () => {
    const redact = make({ ssids: ["a.b*(c)"] });
    expect(redact("x a.b*(c) y")).toBe("x <ssid-1> y");
  });

  test("iperf3 host names and this computer's name", () => {
    const redact = make({ hosts: ["nas.local:5201"], hostname: "alices-mbp" });
    expect(redact("iperf3 -c nas.local -p 5201 on alices-mbp")).toBe(
      "iperf3 -c <host-1> -p 5201 on <hostname>",
    );
  });

  test("the password is still removed with the network hidden", () => {
    const redact = make({ secrets: ["hunter2"] });
    expect(redact("hunter2 ssid: hunter2")).toBe("<password> ssid: <password>");
  });

  test("placeholders are stable across calls to one redactor", () => {
    const redact = make();
    expect(redact("10.1.1.1")).toBe("<ip-1>");
    expect(redact("10.2.2.2 10.1.1.1")).toBe("<ip-2> <ip-1>");
  });

  test("leaves ordinary log lines alone", () => {
    const line =
      "[2026-10-28T09:00:00.000Z] [iperfRunner:DEBUG] Measurement took 4210 ms; tcp 412.5 Mbps; channel 36; Point_12";
    expect(make()(line)).toBe(line);
  });
});
