/**
 * The test and expect every spec imports. Two fixtures:
 *
 * - isolation (automatic): before each test the server goes back to a
 *   fresh start (DELETE /api/e2e/data): no surveys, only the bundled floor
 *   plans, no measurement running, no sudo password held. So a test never
 *   sees what an earlier one saved.
 * - mock: `await mock.set({ iperf: "missing" })` makes the mock backend
 *   behave a particular way (see mockScenarioSchema in src/lib/schema.ts).
 *   Calls add up; `mock.reset()` goes back to normal. Reset after every
 *   test.
 *
 * Both need the e2e server (npm run e2e:serve:*), which sets
 * WIFI_HEATMAPPER_E2E; any other server answers 404.
 */
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import type { MockScenario } from "../src/lib/schema";

export interface MockControl {
  /** Merge these into the scenario in effect. */
  set(scenario: MockScenario): Promise<void>;
  /** Back to the normal mock. */
  reset(): Promise<void>;
}

async function check(
  what: string,
  response: Awaited<ReturnType<APIRequestContext["fetch"]>>,
) {
  if (response.ok()) return;
  const hint =
    response.status() === 404
      ? " The server is not an e2e server (WIFI_HEATMAPPER_E2E): stop the one on this port, or set E2E_PORT."
      : "";
  throw new Error(
    `${what} answered ${response.status()}: ${await response.text()}.${hint}`,
  );
}

export const test = base.extend<{
  mock: MockControl;
  isolation: void;
}>({
  isolation: [
    async ({ request }, provide) => {
      await check(
        "DELETE /api/e2e/data",
        await request.delete("/api/e2e/data"),
      );
      await provide();
    },
    { auto: true },
  ],

  mock: async ({ request }, provide) => {
    let current: MockScenario = {};
    await provide({
      async set(scenario) {
        current = { ...current, ...scenario };
        await check(
          "PUT /api/e2e/scenario",
          await request.put("/api/e2e/scenario", { data: current }),
        );
      },
      async reset() {
        current = {};
        await check(
          "DELETE /api/e2e/scenario",
          await request.delete("/api/e2e/scenario"),
        );
      },
    });
    await check(
      "DELETE /api/e2e/scenario",
      await request.delete("/api/e2e/scenario"),
    );
  },
});

export { expect };
