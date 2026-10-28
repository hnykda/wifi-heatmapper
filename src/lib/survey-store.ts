/**
 * survey-store.ts - the server's survey files, data/surveys/<floor plan>.json.
 *
 * Everything that reads or writes a survey goes through here, so the server
 * is the one owner of the file:
 *
 * - read(name) parses the file leniently (schema.ts), so files from older
 *   versions and hand-edited ones load; a missing file is null.
 * - mutate(name, fn) reads, applies fn and writes, one change at a time per
 *   file (a promise chain per file), so two writers (two tabs, the browser
 *   and the MCP server) can never lose each other's changes. A missing file
 *   starts from the defaults, with the speed settings of the most recently
 *   saved other survey (newSurvey()), so a second floor plan is set up
 *   like the first.
 * - writes go to a temp file that is renamed over the survey, so a crash
 *   never leaves half a JSON file behind; each one is stamped with `meta`;
 *   the sudo password is never written (no schema has it).
 *
 * A file that is not JSON at all is reported (SurveyFileError) and left
 * alone rather than overwritten, so it can still be fixed by hand.
 *
 * The lock only covers this process. One data directory is not meant to be
 * shared by two running servers.
 */
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "fs/promises";
import os from "os";
import path from "path";
import { APP_VERSION, describeOS } from "./app-info";
import { parseSurveyFile, SurveyDocument } from "./schema";
import { defaultSurvey } from "./survey-defaults";
import { copySettings, CopyPart, samePart } from "./survey-ops";
import { getSurveysDir } from "./server-paths";
import { sanitizeFilename } from "./utils";

export const SURVEY_SCHEMA_VERSION = 1;

/** The file couldn't be read as a survey (not JSON, not an object). */
export class SurveyFileError extends Error {}

/** A change that can't be made, with the HTTP status to answer. */
export class SurveyChangeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function surveyFileName(floorPlan: string): string {
  return `${sanitizeFilename(floorPlan)}.json`;
}

export function surveyPath(floorPlan: string): string {
  return path.join(getSurveysDir(), surveyFileName(floorPlan));
}

const sameFile = (a: string, b: string) =>
  sanitizeFilename(a) === sanitizeFilename(b);

function isNotFound(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

// Next.js may load this module once per route bundle; keep the locks on
// globalThis so every route shares them.
const LOCKS_KEY = "__wifiHeatmapperSurveyLocks__";
function locks(): Map<string, Promise<unknown>> {
  const g = globalThis as unknown as Record<
    string,
    Map<string, Promise<unknown>>
  >;
  return (g[LOCKS_KEY] ??= new Map());
}

/** Run fn after every earlier call for the same file has finished. */
function withLock<T>(floorPlan: string, fn: () => Promise<T>): Promise<T> {
  const key = surveyFileName(floorPlan);
  const all = locks();
  const previous = all.get(key) ?? Promise.resolve();
  const result = previous.then(fn);
  const tail = result.catch(() => undefined);
  all.set(key, tail);
  void tail.then(() => {
    if (all.get(key) === tail) all.delete(key);
  });
  return result;
}

/** The survey for a floor plan, or null if it has none. */
export async function read(floorPlan: string): Promise<SurveyDocument | null> {
  let text: string;
  try {
    text = await readFile(surveyPath(floorPlan), "utf-8");
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new SurveyFileError(
      `${surveyFileName(floorPlan)} is not valid JSON (${err instanceof Error ? err.message : err})`,
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SurveyFileError(
      `${surveyFileName(floorPlan)} does not contain a survey`,
    );
  }
  return parseSurveyFile(raw as Record<string, unknown>, floorPlan, sameFile);
}

async function write(floorPlan: string, survey: SurveyDocument) {
  await mkdir(getSurveysDir(), { recursive: true });
  const filePath = surveyPath(floorPlan);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(survey, null, 2));
  await rename(tmpPath, filePath);
}

/**
 * mutate() - change a survey and save it; returns what was saved.
 * fn gets a fresh copy (a new survey if there is no file: newSurvey(), or
 * the plain defaults with `inherit: false`) and returns the next version.
 * It may throw SurveyChangeError to refuse; nothing is written then.
 */
export function mutate(
  floorPlan: string,
  fn: (survey: SurveyDocument) => SurveyDocument | Promise<SurveyDocument>,
  { inherit = true }: { inherit?: boolean } = {},
): Promise<SurveyDocument> {
  return withLock(floorPlan, async () => {
    const existing = await read(floorPlan);
    const created = existing
      ? null
      : inherit
        ? await newSurvey(floorPlan)
        : { survey: defaultSurvey(floorPlan) };
    const current = existing ?? created!.survey;
    const changed = await fn(current);
    // parse again: drops anything that isn't part of a survey (a password)
    const next = parseSurveyFile(
      changed as unknown as Record<string, unknown>,
      floorPlan,
      sameFile,
    );
    next.meta = {
      schemaVersion: SURVEY_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      platform: os.platform(),
      osName: describeOS(),
      savedAt: new Date().toISOString(),
      ...(created?.speedSettingsFrom
        ? { speedSettingsFrom: created.speedSettingsFrom }
        : {}),
    };
    await write(floorPlan, next);
    return next;
  });
}

/**
 * newSurvey() - what a survey file for a new floor plan starts with: the
 * defaults, with the speed settings (what to measure, server, duration,
 * commands) of the most recently saved other survey. speedSettingsFrom
 * names that survey when it changed anything.
 */
export async function newSurvey(
  floorPlan: string,
): Promise<{ survey: SurveyDocument; speedSettingsFrom?: string }> {
  const fresh = defaultSurvey(floorPlan);
  const source = await lastSaved(floorPlan);
  if (!source) return { survey: fresh };
  const survey = copySettings(fresh, source, ["speed"]);
  return samePart(survey, fresh, "speed")
    ? { survey }
    : { survey, speedSettingsFrom: source.floorplanImageName };
}

/**
 * The most recently saved survey other than `except`, by meta.savedAt
 * (files older than 0.5 have no meta: their modification time). Files that
 * can't be read are skipped.
 */
async function lastSaved(except: string): Promise<SurveyDocument | null> {
  let best: SurveyDocument | null = null;
  let bestAt = 0;
  for (const name of await list()) {
    if (sameFile(name, except)) continue;
    try {
      const survey = await read(name);
      if (!survey) continue;
      const at = survey.meta?.savedAt
        ? Date.parse(survey.meta.savedAt)
        : (await stat(surveyPath(name))).mtimeMs;
      if (Number.isFinite(at) && at > bestAt) {
        best = survey;
        bestAt = at;
      }
    } catch {
      // damaged or removed meanwhile: not a source
    }
  }
  return best;
}

/**
 * copyFrom() - copy parts of another survey's settings into `to` (created
 * if missing) and save it; returns what was saved. Points, the floor plan
 * and its size are never copied.
 */
export async function copyFrom(
  from: string,
  to: string,
  parts: readonly CopyPart[],
): Promise<SurveyDocument> {
  if (sameFile(from, to)) {
    throw new SurveyChangeError("Pick another survey to copy from");
  }
  const source = await read(from);
  if (!source) {
    throw new SurveyChangeError(`There is no survey for "${from}"`, 404);
  }
  return mutate(to, (target) => copySettings(target, source, parts));
}

/** Replace the whole survey (the old POST /api/settings). */
export function replace(
  floorPlan: string,
  survey: Record<string, unknown>,
): Promise<SurveyDocument> {
  return mutate(floorPlan, () => parseSurveyFile(survey, floorPlan, sameFile), {
    inherit: false,
  });
}

/** Delete the survey file; a missing one is not an error. */
export function remove(floorPlan: string): Promise<void> {
  return withLock(floorPlan, async () => {
    try {
      await unlink(surveyPath(floorPlan));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  });
}

/** Names of the stored surveys (file names without .json). */
export async function list(): Promise<string[]> {
  const dir = getSurveysDir();
  await mkdir(dir, { recursive: true });
  return (await readdir(dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}
