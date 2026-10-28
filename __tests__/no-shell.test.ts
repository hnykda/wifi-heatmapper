/**
 * Commands run without a shell (lib/server-utils.ts): a value with shell
 * syntax is one argument to the program, never a second command. These run
 * real child processes (node itself stands in for iperf3).
 */
import { afterAll, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execAsync, findOnPath, showCommand } from "@/lib/server-utils";
import { iperfArgs } from "@/lib/iperfUtils";

const work = mkdtempSync(join(tmpdir(), "wifi-heatmapper-noshell-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A stand-in for iperf3 that prints the arguments it was given. */
const echoArgs = join(work, "echo-args.mjs");
writeFileSync(
  echoArgs,
  "console.log(JSON.stringify(process.argv.slice(2)));\n",
);

const argsSeen = async (args: string[]) =>
  JSON.parse(
    (await execAsync(process.execPath, [echoArgs, ...args])).stdout,
  ) as string[];

describe("execAsync runs programs without a shell", () => {
  test("a server like `x; touch <file>` is one argument and runs nothing", async () => {
    const pwned = join(work, "pwned");
    for (const server of [
      `x; touch ${pwned}`,
      `x && touch ${pwned}`,
      `$(touch ${pwned})`,
      `\`touch ${pwned}\``,
      `x | touch ${pwned}`,
      `x > ${pwned}`,
    ]) {
      const args = iperfArgs("tcpDownload", server, "", 1);
      expect(await argsSeen(args)).toEqual(args);
      expect((await argsSeen(args))[1]).toBe(server);
    }
    expect(existsSync(pwned)).toBe(false);
  });

  test("quotes, spaces and empty arguments arrive unchanged", async () => {
    const args = ['"quoted"', "it's", "a b", "", "%PATH%", "$HOME", "*"];
    expect(await argsSeen(args)).toEqual(args);
  });

  test("stdin input reaches the program, and is not part of the command", async () => {
    const readStdin = join(work, "read-stdin.mjs");
    writeFileSync(
      readStdin,
      "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(s)));\n",
    );
    const { stdout } = await execAsync(process.execPath, [readStdin], {
      input: "hunter2\n",
    });
    expect(JSON.parse(stdout)).toBe("hunter2\n");
  });

  test("a failing program rejects with its output and the command, not the input", async () => {
    const fail = join(work, "fail.mjs");
    writeFileSync(
      fail,
      "console.log('out');console.error('bad thing');process.exit(3);\n",
    );
    const err = await execAsync(process.execPath, [fail, "arg one"], {
      input: "hunter2\n",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(3);
    expect(err.stdout.trim()).toBe("out");
    expect(err.message).toMatch(/Command failed: .*fail\.mjs "arg one"/);
    expect(err.message).toMatch(/bad thing/);
    expect(JSON.stringify(err)).not.toContain("hunter2");
    expect(err.message).not.toContain("hunter2");
  });

  test("a missing program rejects (ENOENT) instead of throwing", async () => {
    const err = await execAsync("wifi-heatmapper-no-such-program", []).catch(
      (e) => e,
    );
    expect(err.code).toBe("ENOENT");
  });

  test("aborting kills the program at once", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const running = execAsync(
      process.execPath,
      ["-e", "setTimeout(() => {}, 30000)"],
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 100);
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test("findOnPath finds node, not a made-up program", async () => {
    const dir = join(process.execPath, "..");
    const previous = process.env.PATH;
    process.env.PATH = dir;
    try {
      expect(await findOnPath("node")).toMatch(/node(\.exe)?$/i);
      expect(await findOnPath("wifi-heatmapper-no-such-program")).toBeNull();
    } finally {
      process.env.PATH = previous;
    }
  });

  test("showCommand quotes what needs it, for logs", () => {
    expect(showCommand("iperf3", ["-c", "a b", ""])).toBe('iperf3 -c "a b" ""');
  });
});
