/**
 * fileHandler.ts - the browser's side of the survey API.
 *
 * The server owns the survey files (src/lib/survey-store.ts). The browser
 * sends one change at a time and gets the whole updated survey back:
 *
 *   GET    /api/settings?name=            read (null if there is none)
 *   PATCH  /api/settings?name=            change settings
 *   POST   /api/surveys/<name>/points     add a point
 *   PATCH  /api/surveys/<name>/points/<id> change a point
 *   DELETE /api/surveys/<name>/points     delete points
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
