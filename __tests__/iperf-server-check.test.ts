import { afterEach, expect, test } from "vitest";
import net from "node:net";
import {
  canConnect,
  checkIperfServerReachable,
} from "../src/lib/iperf-server-check";
import { defaultIperfCommands } from "../src/lib/iperfUtils";

let server: net.Server | undefined;
afterEach(() => server?.close());

const listen = () =>
  new Promise<number>((resolve) => {
    server = net.createServer((socket) => socket.end());
    server.listen(0, "127.0.0.1", () =>
      resolve((server!.address() as net.AddressInfo).port),
    );
  });

// A port that was just free: bind, read the number, close.
const closedPort = async () => {
  const port = await listen();
  await new Promise((resolve) => server!.close(resolve));
  server = undefined;
  return port;
};

test("connects to a listening port", async () => {
  expect(await canConnect("127.0.0.1", await listen())).toBe(true);
});

test("reports a refused connection", async () => {
  expect(await canConnect("127.0.0.1", await closedPort())).toBe(false);
});

test("reports an unknown host instead of throwing", async () => {
  expect(await canConnect("no-such-host.invalid", 5201, 500)).toBe(false);
});

test("checkIperfServerReachable returns the user-facing reason", async () => {
  const settings = {
    iperfServerAdrs: "127.0.0.1",
    testDuration: 1,
    sudoerPassword: "",
    iperfCommands: defaultIperfCommands,
  };
  expect(await checkIperfServerReachable(settings, await listen())).toEqual({
    SSIDs: [],
    reason: "",
  });
  const port = await closedPort();
  expect((await checkIperfServerReachable(settings, port)).reason).toBe(
    `Can't reach the speed test server at 127.0.0.1:${port}. Check that iperf3 -s is running there and that no firewall blocks the port.`,
  );
});

const withServer = (iperfServerAdrs: string) => ({
  iperfServerAdrs,
  testDuration: 1,
  sudoerPassword: "",
  iperfCommands: defaultIperfCommands,
});

test("uses the port in host:port instead of the default", async () => {
  const port = await listen();
  // the default port (second argument) is closed: only host:port can work
  const closed = 1;
  expect(
    (await checkIperfServerReachable(withServer(`127.0.0.1:${port}`), closed))
      .reason,
  ).toBe("");
  expect(
    (await checkIperfServerReachable(withServer("127.0.0.1"), closed)).reason,
  ).toMatch(/Can't reach the speed test server at 127\.0\.0\.1:1\./);
});

test("connects to a bracketed IPv6 address with a port", async (ctx) => {
  const port = await new Promise<number | null>((resolve) => {
    server = net.createServer((socket) => socket.end());
    server.once("error", () => resolve(null));
    server.listen(0, "::1", () =>
      resolve((server!.address() as net.AddressInfo).port),
    );
  });
  if (port === null) ctx.skip(); // no IPv6 loopback on this machine
  expect(
    (await checkIperfServerReachable(withServer(`[::1]:${port}`), 1)).reason,
  ).toBe("");
});

test("explains an empty or malformed address without connecting", async () => {
  expect((await checkIperfServerReachable(withServer(""))).reason).toBe(
    "No speed test server is set.",
  );
  expect(
    (await checkIperfServerReachable(withServer("host:99999"))).reason,
  ).toMatch(/not a valid speed test server address/);
});
