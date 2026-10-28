/**
 * mock-scenario.ts - how the mock backend (WIFI_HEATMAPPER_MOCK) behaves,
 * so an e2e test can ask for a particular case: a sudo password needed,
 * iperf3 missing, a speed test that fails half way, no noise reading, a
 * slow measurement to cancel...
 *
 * The scenario only changes what the mock scanner and the mock iperf3
 * answer. Everything above them (the preflight, speed test planning, the
 * measurement job, saving the point, diagnostics) is the real code.
 *
 * Tests set it through PUT /api/e2e/scenario, which exists only when
 * isTestApiEnabled() (see e2e/fixtures.ts). Without a scenario the mock
 * behaves as it always has. Kept on globalThis because Next.js may load
 * this module once per route bundle.
 */
import type { MockScenario } from "./schema";

const DEFAULT_DELAY_MS = parseInt(
  process.env.WIFI_HEATMAPPER_MOCK_DELAY_MS || "150",
  10,
);
const DEFAULT_SEED = parseInt(
  process.env.WIFI_HEATMAPPER_MOCK_SEED || "42",
  10,
);

/** The mock's running state, so the fake iperf3 results track the signal. */
export interface MockReadings {
  strength: number; // percent
  measurements: number;
  /** chosen once per measurement, so the band never flips half way */
  band: 2.4 | 5;
  /** iperf3 runs in the current measurement (for fails-midway) */
  iperfRuns: number;
  /** the PRNG state (mulberry32) */
  seed: number;
}

interface Store {
  scenario: MockScenario;
  readings: MockReadings;
}

const KEY = "__wifiHeatmapperMockScenario__";

function freshReadings(): MockReadings {
  return {
    strength: 78,
    measurements: 0,
    band: 5,
    iperfRuns: 0,
    seed: DEFAULT_SEED >>> 0,
  };
}

function store(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  return (g[KEY] ??= { scenario: {}, readings: freshReadings() });
}

/**
 * true when the e2e control API (/api/e2e/...) may answer: mock mode, an
 * explicit WIFI_HEATMAPPER_E2E, a data directory of its own (the reset
 * deletes every survey in it), and not the desktop app. The e2e:serve
 * scripts set all of these; `npm run dev`, Docker, the desktop app and a
 * plain `next start` never do.
 */
export function isTestApiEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const on = (v: string | undefined) =>
    !!v && v !== "0" && v.toLowerCase() !== "false";
  return (
    on(env.WIFI_HEATMAPPER_MOCK) &&
    on(env.WIFI_HEATMAPPER_E2E) &&
    !!env.WIFI_HEATMAPPER_DATA_DIR &&
    !env.WIFI_HEATMAPPER_RESOURCES_DIR
  );
}

/** The scenario in effect ({} = the normal mock). */
export function mockScenario(): Readonly<MockScenario> {
  return store().scenario;
}

/** Replace the scenario. */
export function setMockScenario(scenario: MockScenario): void {
  store().scenario = { ...scenario };
}

/** Back to the normal mock, with the readings starting over. */
export function resetMockScenario(): void {
  const s = store();
  s.scenario = {};
  s.readings = freshReadings();
}

export function mockReadings(): MockReadings {
  return store().readings;
}

/** How long one mock step takes. */
export function mockDelayMs(): number {
  return mockScenario().delayMs ?? DEFAULT_DELAY_MS;
}

/** A number in [0, 1): deterministic, so runs are repeatable (mulberry32). */
export function mockRandom(): number {
  const r = store().readings;
  r.seed = (r.seed + 0x6d2b79f5) >>> 0;
  let t = r.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** What `iperf3 --version` says in mock mode, or null if it is "missing". */
export function mockIperf3Version(): string | null {
  return mockScenario().iperf === "missing" ? null : "iperf 3.17 (mock)";
}

/** Does the mock speed test server answer? */
export function mockServerReachable(): boolean {
  return mockScenario().iperf !== "unreachable";
}

/** Does the Settings tab ask for a sudo password (mock mode)? */
export function mockNeedsSudo(): boolean {
  const wifi = mockScenario().wifi;
  return wifi === "needs-sudo" || wifi === "wrong-sudo";
}
