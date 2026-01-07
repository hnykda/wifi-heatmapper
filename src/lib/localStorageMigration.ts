/**
 * Migration utility for localStorage -> file-based storage
 *
 * Checks for existing wifi-heatmapper data in localStorage and
 * migrates it to the new file-based storage system.
 */

import { HeatmapSettings } from "./types";
import { writeSettingsToFile, readSettingsFromFile } from "./fileHandler";

const MIGRATION_TIMESTAMP_KEY = "wifi-heatmapper-migrated-to-file-storage";
const BASE_KEY = "wifi*heatmapper";

// Guard against double execution in React strict mode
let migrationInProgress = false;

export function hasLocalStorageData(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BASE_KEY) !== null;
}

export function hasMigrated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MIGRATION_TIMESTAMP_KEY) !== null;
}

function getLocalStorageSurveys(): {
  name: string;
  data: HeatmapSettings;
}[] {
  if (typeof window === "undefined") return [];

  const surveys: { name: string; data: HeatmapSettings }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      key.startsWith("wifi-heatmapper-") &&
      key !== MIGRATION_TIMESTAMP_KEY
    ) {
      const floorplanName = key.replace("wifi-heatmapper-", "");
      try {
        const data = JSON.parse(localStorage.getItem(key) || "");
        if (data && data.floorplanImageName) {
          surveys.push({ name: floorplanName, data });
        }
      } catch {
        // Skip malformed entries
      }
    }
  }

  return surveys;
}

/**
 * Migrate all localStorage data to file-based storage.
 * Returns the number of surveys migrated.
 * Skips surveys that already exist as files (won't overwrite).
 * localStorage data is preserved so users can revert if needed.
 */
export async function migrateLocalStorageToFiles(): Promise<number> {
  if (typeof window === "undefined") return 0;

  // Guard against double execution (React strict mode)
  if (migrationInProgress) return 0;
  migrationInProgress = true;

  try {
    const surveys = getLocalStorageSurveys();
    let migrated = 0;

    for (const { name, data } of surveys) {
      try {
        const existing = await readSettingsFromFile(name);
        if (!existing) {
          await writeSettingsToFile(data);
          migrated++;
        }
      } catch {
        // Continue with other surveys if one fails
      }
    }

    if (migrated > 0 || surveys.length > 0) {
      localStorage.setItem(MIGRATION_TIMESTAMP_KEY, new Date().toISOString());
    }

    return migrated;
  } finally {
    migrationInProgress = false;
  }
}
