/**
 * The test and expect every spec imports. Three fixtures:
 *
 * - isolation (automatic): before each test the server goes back to a
 *   fresh start (DELETE /api/e2e/data): no surveys, only the bundled floor
 *   plans, no measurement running, no sudo password held. So a test never
 *   sees what an earlier one saved. It first checks that the pages of the
 *   test before left no event stream open on the server.
 * - context (replaces Playwright's): when the test ends, its pages send
 *   what they hold back (as when a tab closes), and the browser closes
 *   only once their requests are answered. A request cut off halfway
 *   makes `next dev` log an uncaught exception, which fails the run
 *   (server-log.ts).
 * - mock: `await mock.set({ iperf: "missing" })` makes the mock backend
 *   behave a particular way (see mockScenarioSchema in src/lib/schema.ts).
 *   Calls add up; `mock.reset()` goes back to normal. Reset after every
 *   test.
 *
 * They need the e2e server (npm run e2e:serve:*), which sets
 * WIFI_HEATMAPPER_E2E; any other server answers 404.
 */
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Request,
} from "@playwright/test";
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

/** The requests of a context's pages that have no answer yet. */
function trackRequests(context: BrowserContext) {
  const open = new Set<Request>();
  let wake = () => {};
  const answered = (request: Request) => {
    open.delete(request);
    if (open.size === 0) wake();
  };
  context.on("request", (request) => {
    // The event stream never ends by itself; its route handles the close
    if (request.resourceType() !== "eventsource") open.add(request);
  });
  context.on("requestfinished", answered);
  context.on("requestfailed", answered);
  // A reload cuts off the requests of the page before, and Playwright
  // doesn't always report them as failed
  context.on("page", (page) =>
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      for (const request of open) {
        if (request.frame() === frame && !request.isNavigationRequest()) {
          answered(request);
        }
      }
    }),
  );
  return {
    open,
    allAnswered: () =>
      open.size === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => (wake = resolve)),
  };
}

/**
 * Let the pages finish talking to the server: send the settings change
 * they debounce (the app does on pagehide), then wait until every request
 * is answered and no page started another one meanwhile (saves are
 * queued: the next goes once the one before is answered).
 */
async function settle(
  context: BrowserContext,
  requests: ReturnType<typeof trackRequests>,
) {
  const inPages = (fn: () => unknown) =>
    Promise.all(
      context
        .pages()
        .filter((page) => !page.isClosed())
        .map((page) => page.evaluate(fn).catch(() => {})),
    );
  await inPages(() => window.dispatchEvent(new Event("pagehide")));
  for (;;) {
    await requests.allAnswered();
    // A round trip through each page: an answer it was handling has been
    // handled, and the request that follows it (if any) has been seen
    await inPages(() => new Promise((resolve) => setTimeout(resolve)));
    if (requests.open.size === 0) return;
  }
}

export const test = base.extend<{
  mock: MockControl;
  isolation: void;
}>({
  context: async ({ context }, provide) => {
    const requests = trackRequests(context);
    await provide(context);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      settle(context, requests).then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 15_000);
      }),
    ]);
    clearTimeout(timer);
    if (!settled) {
      const open = [...requests.open].map((r) => `${r.method()} ${r.url()}`);
      console.warn(`Closing the pages with requests open: ${open.join(", ")}`);
    }
  },

  isolation: [
    async ({ request }, provide) => {
      await expect
        .poll(
          async () => {
            const response = await request.get("/api/e2e/data");
            await check("GET /api/e2e/data", response);
            return (await response.json()).eventStreams;
          },
          { message: "event streams the last test's pages left open" },
        )
        .toBe(0);
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
