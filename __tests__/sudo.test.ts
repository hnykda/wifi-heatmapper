/**
 * sudo gets the password on stdin, never on the command line, and the
 * password is checked once per value (lib/sudo.ts). child_process.spawn is
 * mocked: nothing here runs sudo.
 */
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Call = { file: string; args: string[]; stdin: string };
const spawned = vi.hoisted(() => ({
  calls: [] as Call[],
  // exit code for a call (set in beforeEach)
  exitCode: (() => 0) as (call: Call) => number,
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const spawn = (file: string, args: string[]) => {
    const call: Call = { file, args, stdin: "" };
    spawned.calls.push(call);
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable;
      stdout: PassThrough;
      stderr: PassThrough;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _enc, done) {
        call.stdin += chunk.toString();
        done();
      },
      final(done) {
        done();
        // the "program" answers once its stdin is closed
        setImmediate(() => {
          const code = spawned.exitCode(call);
          if (code !== 0) child.stderr.write("Sorry, try again.\n");
          child.stdout.end("Current Wi-Fi\n");
          child.stderr.end();
          child.emit("close", code, null);
        });
      },
    });
    return child;
  };
  return { ...actual, spawn, default: { ...actual, spawn } };
});

const { runWithSudo, checkSudoPassword, forgetSudoPassword } = await import(
  "../src/lib/sudo"
);

let goodPassword: string;
beforeEach(() => {
  spawned.calls = [];
  forgetSudoPassword();
  goodPassword = "right";
  spawned.exitCode = (call) => (call.stdin === `${goodPassword}\n` ? 0 : 1);
});

describe("runWithSudo", () => {
  test("passes the password on stdin with -S and an empty prompt", async () => {
    const { stdout } = await runWithSudo("right", ["wdutil", "info"]);
    expect(stdout).toBe("Current Wi-Fi");
    expect(spawned.calls).toEqual([
      {
        file: "sudo",
        args: ["-S", "-p", "", "wdutil", "info"],
        stdin: "right\n",
      },
    ]);
  });

  test("a password with shell syntax is just bytes on stdin", async () => {
    goodPassword = `a"b; rm -rf ~ $(id) | x`;
    await runWithSudo(goodPassword, ["iw", "dev", "wlan0", "link"]);
    const [call] = spawned.calls;
    expect(call.args).toEqual(["-S", "-p", "", "iw", "dev", "wlan0", "link"]);
    expect(call.args.join(" ")).not.toContain("rm -rf");
    expect(call.stdin).toBe(`${goodPassword}\n`);
  });

  test("a refused password rejects without showing the password", async () => {
    const err = await runWithSudo("wrong-pw", ["wdutil", "info"]).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/Command failed: sudo -S -p "" wdutil info/);
    expect(err.message).not.toContain("wrong-pw");
    expect(err.cmd).not.toContain("wrong-pw");
  });
});

describe("checkSudoPassword", () => {
  test("ignores a cached sudo login (-k) and checks once per password", async () => {
    expect(await checkSudoPassword("right")).toBe(true);
    expect(await checkSudoPassword("right")).toBe(true);
    expect(spawned.calls).toHaveLength(1);
    expect(spawned.calls[0]).toEqual({
      file: "sudo",
      args: ["-k", "-S", "-p", "", "true"],
      stdin: "right\n",
    });
  });

  test("a wrong password is checked every time, so fixing it works at once", async () => {
    expect(await checkSudoPassword("wrong")).toBe(false);
    expect(await checkSudoPassword("wrong")).toBe(false);
    expect(spawned.calls).toHaveLength(2);
    expect(await checkSudoPassword("right")).toBe(true);
  });

  test("another password is checked again", async () => {
    expect(await checkSudoPassword("right")).toBe(true);
    goodPassword = "new";
    expect(await checkSudoPassword("new")).toBe(true);
    expect(spawned.calls).toHaveLength(2);
  });
});
