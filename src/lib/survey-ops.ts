/**
 * survey-ops.ts - the changes the API makes to a survey, as pure functions.
 * The server applies them under the file's lock (survey-store.ts); the
 * browser applies the same ones to its copy so the change shows at once,
 * then takes whatever the server answers.
 */
import type {
  HeatmapKey,
  HeatmapRanges,
  NewSurveyPoint,
  SettingsPatch,
  SurveyDocument,
  SurveyPointPatch,
} from "./types";

/** The settings PATCH /api/settings can change (settingsPatchSchema). */
export const SETTINGS_PATCH_KEYS = [
  "measureSpeed",
  "iperfServerAdrs",
  "testDuration",
  "apMapping",
  "dimensions",
  "radiusDivider",
  "maxOpacity",
  "minOpacity",
  "blur",
  "gradient",
  "heatmapRanges",
  "iperfCommands",
] as const satisfies readonly (keyof SettingsPatch)[];

/** Apply a validated settings patch. */
export function applySettingsPatch<T extends SurveyDocument>(
  survey: T,
  patch: SettingsPatch,
): T {
  const { heatmapRanges, iperfCommands, ...plain } = patch;
  const next: T = { ...survey };
  for (const [key, value] of Object.entries(plain)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  if (iperfCommands) {
    next.iperfCommands = { ...survey.iperfCommands };
    for (const [key, command] of Object.entries(iperfCommands)) {
      if (command !== undefined) {
        next.iperfCommands[key as keyof typeof iperfCommands] = command;
      }
    }
  }
  if (heatmapRanges) {
    const ranges: HeatmapRanges = { ...survey.heatmapRanges };
    for (const [key, scale] of Object.entries(heatmapRanges)) {
      if (scale === null) delete ranges[key as HeatmapKey];
      else if (scale) ranges[key as HeatmapKey] = scale;
    }
    next.heatmapRanges = ranges;
  }
  return next;
}

/**
 * Add a point. It keeps a given id that is free, else gets the next free
 * "Point_N" (never below nextPointNum, never one already used).
 */
export function addPoint<T extends SurveyDocument>(
  survey: T,
  point: NewSurveyPoint,
): T {
  const used = new Set(survey.surveyPoints.map((p) => p.id));
  let num = Math.max(1, survey.nextPointNum);
  let id = point.id && !used.has(point.id) ? point.id : "";
  if (!id) {
    while (used.has(`Point_${num}`)) num++;
    id = `Point_${num}`;
  }
  return {
    ...survey,
    nextPointNum: num + 1,
    surveyPoints: [...survey.surveyPoints, { ...point, id }],
  };
}

/** Change one point; returns null if there is no point with that id. */
export function updatePoint<T extends SurveyDocument>(
  survey: T,
  id: string,
  patch: SurveyPointPatch,
): T | null {
  if (!survey.surveyPoints.some((p) => p.id === id)) return null;
  return {
    ...survey,
    surveyPoints: survey.surveyPoints.map((p) =>
      p.id === id ? { ...p, ...patch, id } : p,
    ),
  };
}

/** Remove points by id; unknown ids are ignored. */
export function deletePoints<T extends SurveyDocument>(
  survey: T,
  ids: string[],
): T {
  const gone = new Set(ids);
  return {
    ...survey,
    surveyPoints: survey.surveyPoints.filter((p) => !gone.has(p.id)),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * keepUnchanged() - `next`, but reusing every part of `previous` that is
 * equal to it, so React memos and effects keyed on (say) the points array
 * don't rerun when the server answers with the same data.
 */
export function keepUnchanged<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const items = next.map((item, i) => keepUnchanged(previous[i], item));
    return items.length === previous.length &&
      items.every((item, i) => item === previous[i])
      ? previous
      : (items as T);
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    const keys = Object.keys(next);
    const out: Record<string, unknown> = {};
    let same = keys.length === Object.keys(previous).length;
    for (const key of keys) {
      out[key] = keepUnchanged(previous[key], next[key]);
      if (out[key] !== previous[key] || !(key in previous)) same = false;
    }
    return same ? previous : (out as T);
  }
  return next;
}
