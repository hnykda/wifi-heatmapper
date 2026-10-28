/**
 * The measurement job (lib/measurement-job.ts): one at a time, cancel
 * stops it at once (and kills the running command), the server saves the
 * point itself, exactly once and at the spot it was started for, and a
 * cancelled job never saves.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getJob,
  resetMeasurementJobs,
  Runner,
  startMeasurement,
  stopMeasurement,
  subscribe,
} from "@/lib/measurement-job";
import * as store from "@/lib/survey-store";
import { execAsync } from "@/lib/server-utils";
import { defaultIperfCommands } from "@/lib/iperfUtils";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";
import type { MeasurementEvent, PartialHeatmapSettings } from "@/lib/types";
import { lastMeasurement } from "@/lib/diagnostics-state";
import type { MeasureResult } from "@/lib/iperfRunner";

const dataDir = mkdtempSync(join(tmpdir(), "wifi-heatmapper-job-"));
const previous = process.env.WIFI_HEATMAPPER_DATA_DIR;
process.env.WIFI_HEATMAPPER_DATA_DIR = dataDir;

afterAll(() => {
  if (previous === undefined) delete process.env.WIFI_HEATMAPPER_DATA_DIR;
  else process.env.WIFI_HEATMAPPER_DATA_DIR = previous;
  rmSync(dataDir, { recursive: true, force: true });
});

let events: MeasurementEvent[];
let unsubscribe: () => void;
beforeEach(() => {
  rmSync(join(dataDir, "surveys"), { recursive: true, force: true });
  resetMeasurementJobs();
  events = [];
  unsubscribe = subscribe((e) => events.push(e));
});
afterEach(() => {
  unsubscribe();
  resetMeasurementJobs();
});

const settings: PartialHeatmapSettings = {
  measureSpeed: false,
  iperfServerAdrs: "",
  testDuration: 1,
  sudoerPassword: "",
  iperfCommands: defaultIperfCommands,
};

const measured = (signalStrength = 64): MeasureResult => ({
  wifiData: { ...getDefaultWifiResults(), ssid: "Home", signalStrength },
  iperfData: getDefaultIperfResults(),
  status: "",
  fields: { strength: `${signalStrength}%`, tcp: "Off", udp: "Off" },
});

/** A runner that waits until `release()` (or the signal) before answering. */
function gatedRunner(result: MeasureResult = measured()) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const runner: Runner = async (_settings, { emit }) => {
    emit?.({ type: "update", header: "Measuring Wi-Fi", status: "" });
    await gate; // ignores the signal: like a step that can't be interrupted
    return result;
  };
  return { runner, release: () => release() };
}

async function until(check: () => boolean, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const start = (runner: Runner, survey = "plan.png", x = 120, y = 80) =>
  startMeasurement({ survey, x, y, settings }, runner);

const finished = (id: string) => () =>
  ["done", "error", "cancelled"].includes(getJob(id)?.state ?? "");

describe("measurement job", () => {
  it("starts, reports progress to every listener and saves one point at its spot", async () => {
    const second: MeasurementEvent[] = [];
    const stop = subscribe((e) => second.push(e));
    const { runner, release } = gatedRunner(measured(71));
    const started = await start(runner, "plan.png", 321, 123);
    expect(started.ok).toBe(true);
    const id = started.ok ? started.job.id : "";
    expect(getJob(id)?.state).toBe("running");
    release();
    await until(finished(id));
    stop();

    const job = getJob(id)!;
    expect(job.state).toBe("done");
    expect(job.pointId).toBe("Point_1");
    const survey = (await store.read("plan.png"))!;
    expect(survey.surveyPoints).toHaveLength(1);
    expect(survey.surveyPoints[0]).toMatchObject({
      id: "Point_1",
      x: 321,
      y: 123,
      isEnabled: true,
    });
    expect(survey.surveyPoints[0].wifiData.signalStrength).toBe(71);

    // both streams saw the same events, each naming the job
    expect(second).toEqual(events);
    expect(events.every((e) => e.jobId === id && e.survey === "plan.png")).toBe(
      true,
    );
    const done = events.filter((e) => e.type === "done");
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({
      state: "done",
      pointId: "Point_1",
      header: "Measurement complete",
      x: 321,
      y: 123,
    });
    expect(lastMeasurement()).toMatchObject({ ok: true });
  });

  it("refuses a second start while one runs (409 in the route)", async () => {
    const { runner, release } = gatedRunner();
    const first = await start(runner);
    const second = await start(gatedRunner().runner, "other.png");
    expect(second.ok).toBe(false);
    if (!second.ok && first.ok) expect(second.running.id).toBe(first.job.id);
    release();
    await until(finished(first.ok ? first.job.id : ""));
    // finished: the next one may start
    expect((await start(gatedRunner().runner)).ok).toBe(true);
  });

  it("a cancelled job never saves, even if its last step still returns", async () => {
    const { runner, release } = gatedRunner();
    const started = await start(runner);
    const id = started.ok ? started.job.id : "";
    expect(stopMeasurement(id)).toBe(true);
    // cancelled at once, for every tab
    expect(getJob(id)?.state).toBe("cancelled");
    expect(events.at(-1)).toMatchObject({ type: "done", state: "cancelled" });
    release(); // the measurement code returns a reading anyway
    await new Promise((r) => setTimeout(r, 50));
    expect(await store.read("plan.png")).toBeNull();
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
  });

  it("a stop for another job changes nothing", async () => {
    const { runner, release } = gatedRunner();
    const started = await start(runner);
    const id = started.ok ? started.job.id : "";
    expect(stopMeasurement("someone-elses-job")).toBe(false);
    release();
    await until(finished(id));
    expect(getJob(id)?.state).toBe("done");
    expect((await store.read("plan.png"))!.surveyPoints).toHaveLength(1);
  });

  it("after a cancel, the next spot starts once the old job has stopped, and only it saves", async () => {
    const a = gatedRunner(measured(10));
    const startedA = await start(a.runner, "plan.png", 10, 10);
    const idA = startedA.ok ? startedA.job.id : "";
    stopMeasurement(idA);
    const b = gatedRunner(measured(90));
    const startingB = start(b.runner, "plan.png", 500, 400);
    a.release(); // A's last step returns while B waits
    const startedB = await startingB;
    expect(startedB.ok).toBe(true);
    const idB = startedB.ok ? startedB.job.id : "";
    b.release();
    await until(finished(idB));
    const points = (await store.read("plan.png"))!.surveyPoints;
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ x: 500, y: 400 });
    expect(points[0].wifiData.signalStrength).toBe(90);
    expect(getJob(idA)?.state).toBe("cancelled");
  });

  it("a measurement error saves nothing and is reported", async () => {
    const started = await start(async () => ({
      wifiData: null,
      iperfData: null,
      status: "Please set sudo password.",
    }));
    const id = started.ok ? started.job.id : "";
    await until(finished(id));
    expect(getJob(id)).toMatchObject({
      state: "error",
      error: "Please set sudo password.",
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      state: "error",
      status: "Please set sudo password.",
    });
    expect(await store.read("plan.png")).toBeNull();
    expect(lastMeasurement()).toMatchObject({
      ok: false,
      error: "Please set sudo password.",
    });
  });

  it("keeps a speed-test warning with the saved point", async () => {
    const started = await start(async () => ({
      ...measured(),
      warning: "iperf3 is not installed on this computer",
    }));
    const id = started.ok ? started.job.id : "";
    await until(finished(id));
    expect(getJob(id)).toMatchObject({
      state: "done",
      warning: "iperf3 is not installed on this computer",
    });
    expect(events.at(-1)).toMatchObject({ header: "Saved without speed" });
    expect(lastMeasurement()?.note).toBe(
      "Saved without speed: iperf3 is not installed on this computer",
    );
  });

  it.skipIf(process.platform === "win32")(
    "cancel kills the running command",
    async () => {
      const marker = `sleep ${30 + Math.floor(Math.random() * 1000) / 1000}`;
      const running = () => {
        try {
          return execFileSync("pgrep", ["-f", marker]).toString().trim();
        } catch {
          return ""; // pgrep exits 1 when nothing matches
        }
      };
      const started = await start(async (_s, { signal }) => {
        await execAsync(marker, { signal });
        return measured();
      });
      const id = started.ok ? started.job.id : "";
      await until(() => running() !== "");
      const t0 = Date.now();
      expect(stopMeasurement(id)).toBe(true);
      await until(() => running() === "", 2000);
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(getJob(id)?.state).toBe("cancelled");
      expect(await store.read("plan.png")).toBeNull();
    },
  );
});
