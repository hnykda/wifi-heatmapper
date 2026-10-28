/**
 * The server holds the sudo password the Settings tab gives it, in memory,
 * for measurements started without one (an MCP agent's). It never comes
 * back out of the API. The measurement job is mocked: nothing runs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { StartRequest } from "@/lib/measurement-job";

const started = vi.hoisted(() => [] as StartRequest[]);
vi.mock("@/lib/measurement-job", () => ({
  currentJob: () => null,
  getJob: () => null,
  stopMeasurement: () => false,
  startMeasurement: async (request: StartRequest) => {
    started.push(request);
    return {
      ok: true,
      job: { id: "j1", survey: request.survey, x: 0, y: 0, state: "running" },
    };
  },
}));

import * as sudoRoute from "@/app/api/sudo-password/route";
import * as startTaskRoute from "@/app/api/start-task/route";
import { heldSudoPassword } from "@/lib/sudo-session";
import { defaultIperfCommands } from "@/lib/iperfUtils";

function req(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
  });
}

const settings = {
  measureSpeed: false,
  iperfServerAdrs: "",
  testDuration: 1,
  iperfCommands: defaultIperfCommands,
};

async function start(extra: Record<string, unknown> = {}) {
  const res = await startTaskRoute.POST(
    req("/api/start-task?action=start", "POST", {
      survey: "Home.png",
      x: 1,
      y: 2,
      settings: { ...settings, ...extra },
    }),
  );
  expect(res.status).toBe(200);
  return started.at(-1)!.settings.sudoerPassword;
}

afterEach(async () => {
  await sudoRoute.DELETE();
});

describe("the held sudo password", () => {
  it("is held from Settings, used by starts without one, and never returned", async () => {
    expect(await (await sudoRoute.GET()).json()).toEqual({ held: false });
    expect(await start()).toBe(""); // nothing held, nothing sent

    const put = await sudoRoute.PUT(
      req("/api/sudo-password", "PUT", { password: "s3cret-pw" }),
    );
    expect(await put.text()).toBe('{"held":true}');
    const get = await (await sudoRoute.GET()).text();
    expect(get).toBe('{"held":true}');
    expect(get).not.toContain("s3cret-pw");

    // an MCP start sends none (or ""): the held one is used
    expect(await start()).toBe("s3cret-pw");
    expect(await start({ sudoerPassword: "" })).toBe("s3cret-pw");
    // a page's start brings its own, which becomes the held one
    expect(await start({ sudoerPassword: "other-pw" })).toBe("other-pw");
    expect(heldSudoPassword()).toBe("other-pw");

    // emptying the field (or DELETE) forgets it
    await sudoRoute.PUT(req("/api/sudo-password", "PUT", { password: "" }));
    expect(await (await sudoRoute.GET()).json()).toEqual({ held: false });
    expect(await start()).toBe("");
  });

  it("refuses a body that isn't { password }", async () => {
    const res = await sudoRoute.PUT(
      req("/api/sudo-password", "PUT", { password: "x", extra: 1 }),
    );
    expect(res.status).toBe(400);
    expect(heldSudoPassword()).toBe("");
  });
});
