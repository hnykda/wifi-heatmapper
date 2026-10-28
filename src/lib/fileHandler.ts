/**
 * fileHandler.ts - the browser's side of the survey API.
 *
 * The server owns the survey files (src/lib/survey-store.ts). The browser
 * sends one change at a time and gets the whole updated survey back:
 *
 *   GET    /api/settings?name=            read (null if there is none)
 *   PATCH  /api/settings?name=            change settings
 *   POST   /api/settings/copy?from=&to=   copy settings from another survey
 *   POST   /api/surveys/<name>/points     add a point
 *   PATCH  /api/surveys/<name>/points/<id> change a point
 *   DELETE /api/surveys/<name>/points     delete points
 *   PUT    /api/sudo-password             the sudo password, held in the
 *                                         server's memory (sudo-session.ts)
 *
 * Each function throws SurveyApiError when the server refuses.
 */
import type {
  HeatmapSettings,
  NewSurveyPoint,
  SettingsPatch,
  SurveyDocument,
  SurveyPointPatch,
} from "./types";
import type { CopyPart } from "./survey-ops";

export class SurveyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call(url: string, init?: RequestInit): Promise<SurveyDocument> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body.error === "string"
        ? body.error
        : `${response.status} ${response.statusText}`;
    throw new SurveyApiError(message, response.status);
  }
  return body as SurveyDocument;
}

const settingsUrl = (name: string) =>
  `/api/settings?name=${encodeURIComponent(name)}`;
const pointsUrl = (name: string) =>
  `/api/surveys/${encodeURIComponent(name)}/points`;

/** The survey for a floor plan, or null if it has none yet. */
export async function getSurvey(name: string): Promise<SurveyDocument | null> {
  try {
    return await call(settingsUrl(name));
  } catch (err) {
    if (err instanceof SurveyApiError && err.status === 404) return null;
    throw err;
  }
}

/** Change settings; an empty patch creates the survey if it is missing. */
export function patchSettings(
  name: string,
  patch: SettingsPatch,
  { keepalive = false } = {},
): Promise<SurveyDocument> {
  return call(settingsUrl(name), {
    method: "PATCH",
    body: JSON.stringify(patch),
    keepalive,
  });
}

/** Copy parts of another survey's settings into this one. */
export function copySettings(
  from: string,
  to: string,
  parts: readonly CopyPart[],
): Promise<SurveyDocument> {
  const query = new URLSearchParams({ from, to, parts: parts.join(",") });
  return call(`/api/settings/copy?${query}`, { method: "POST" });
}

/** Names of the stored surveys (floor plans that have one). */
/**
 * Give the server the sudo password ("" forgets it), so measurements an AI
 * agent starts can read Wi-Fi too. Memory only on the server, never saved
 * or returned. Best effort: a failure only matters for those.
 */
export async function shareSudoPassword(password: string): Promise<void> {
  await fetch("/api/sudo-password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }).catch(() => {});
}

export async function listSurveys(): Promise<string[]> {
  const response = await fetch("/api/settings?list=true");
  if (!response.ok) {
    throw new SurveyApiError(
      `${response.status} ${response.statusText}`,
      response.status,
    );
  }
  return ((await response.json()).surveys as string[]) ?? [];
}

export function addPoint(
  name: string,
  point: NewSurveyPoint,
): Promise<SurveyDocument> {
  return call(pointsUrl(name), { method: "POST", body: JSON.stringify(point) });
}

export function updatePoint(
  name: string,
  id: string,
  patch: SurveyPointPatch,
): Promise<SurveyDocument> {
  return call(`${pointsUrl(name)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deletePoints(
  name: string,
  ids: string[],
): Promise<SurveyDocument> {
  return call(pointsUrl(name), {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

/* ---------- whole documents: only the localStorage migration ---------- */

/** The stored survey, or null if there is none or it can't be read. */
export async function readSettingsFromFile(
  fileName: string,
): Promise<SurveyDocument | null> {
  if (!fileName) return null;
  try {
    return await getSurvey(fileName);
  } catch (error) {
    console.error("Error reading settings:", error);
    return null;
  }
}

/**
 * Import a whole survey (POST /api/settings). The server reads it like an
 * old file, so data from any version is accepted. Never rejects.
 */
export async function writeSettingsToFile(
  settings: HeatmapSettings,
): Promise<void> {
  try {
    await call("/api/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  } catch (error) {
    console.error(
      `[wifi-heatmapper] Failed to save settings for "${settings.floorplanImageName}":`,
      error,
    );
  }
}
