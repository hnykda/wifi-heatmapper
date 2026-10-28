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
  expect(
    (await checkIperfServerReachable(settings, await closedPort())).reason,
  ).toBe("Cannot connect to iperf3 server.");
});
