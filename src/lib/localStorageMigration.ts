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

/**
 * Check if there's localStorage data that needs migration
 */
export function hasLocalStorageData(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BASE_KEY) !== null;
}

/**
 * Check if migration has already been performed
 * Returns the migration timestamp if migrated, null otherwise
 */
export function getMigrationTimestamp(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(MIGRATION_TIMESTAMP_KEY);
}

/**
 * Check if migration has already been performed
 */
export function hasMigrated(): boolean {
  return getMigrationTimestamp() !== null;
}

/**
 * Get all survey data from localStorage
 */
export function getLocalStorageSurveys(): {
  name: string;
  data: HeatmapSettings;
}[] {
  if (typeof window === "undefined") return [];

  const surveys: { name: string; data: HeatmapSettings }[] = [];

  // Find all wifi-heatmapper-* keys
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
        console.warn(`Failed to parse localStorage data for key: ${key}`);
      }
    }
  }

  return surveys;
}

/**
 * Migrate all localStorage data to file-based storage
 * Returns the number of surveys migrated
 */
export async function migrateLocalStorageToFiles(): Promise<number> {
  if (typeof window === "undefined") return 0;

  // Guard against double execution (React strict mode)
  if (migrationInProgress) {
    console.log("Migration already in progress, skipping...");
    return 0;
  }
  migrationInProgress = true;

  try {
    const surveys = getLocalStorageSurveys();
    let migrated = 0;

    for (const { name, data } of surveys) {
      try {
        // Check if this survey already exists in file storage
        const existing = await readSettingsFromFile(name);
        if (!existing) {
          // Migrate to file storage
          await writeSettingsToFile(data);
          console.log(`Migrated survey: ${name}`);
          migrated++;
        } else {
          console.log(`Survey already exists in file storage: ${name}`);
        }
      } catch (err) {
        console.error(`Failed to migrate survey ${name}:`, err);
      }
    }

    // Mark migration as complete with timestamp
    // Note: localStorage data is preserved so users can revert if needed
    if (migrated > 0 || surveys.length > 0) {
      localStorage.setItem(MIGRATION_TIMESTAMP_KEY, new Date().toISOString());
    }

    return migrated;
  } finally {
    migrationInProgress = false;
  }
}

/**
 * Clear localStorage data after successful migration (optional)
 * Call this only after confirming migration was successful
 */
export function clearLocalStorageData(): void {
  if (typeof window === "undefined") return;

  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("wifi-heatmapper") || key === BASE_KEY)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
  console.log(`Cleared ${keysToRemove.length} localStorage entries`);
}
