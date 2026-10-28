/**
 * e2e-control.ts - what the e2e control API (/api/e2e/...) does. Only
 * reachable when isTestApiEnabled() (mock-scenario.ts): the routes answer
 * 404 otherwise, so a real install never has them.
 */
import "server-only";
import { promises as fs } from "fs";
import { getMediaDir, getSurveysDir } from "./server-paths";
import { seedBundledFloorplans } from "./server-init";
import { stopAndForgetJobs } from "./measurement-job";
import * as store from "./survey-store";
import { resetDiagnosticsState } from "./diagnostics-state";
import { holdSudoPassword } from "./sudo-session";
import { forgetSudoPassword } from "./sudo";
import { resetMockScenario } from "./mock-scenario";

/**
 * Back to a freshly started server: no measurement running, no surveys,
 * only the bundled floor plans, the normal mock, no sudo password held,
 * no diagnostics records. Usage counts settings are left alone.
 */
export async function resetTestData(): Promise<void> {
  await stopAndForgetJobs();
  await store.settled();
  for (const dir of [getSurveysDir(), getMediaDir()]) {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
  }
  await seedBundledFloorplans();
  resetMockScenario();
  resetDiagnosticsState();
  holdSudoPassword("");
  forgetSudoPassword();
}
