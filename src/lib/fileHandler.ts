/**
 * wifi-heatmapper file storage
 *
 * Survey data is stored as JSON files in data/surveys/
 * Each floorplan has its own file: data/surveys/<floorplanImageName>.json
 *
 * - readSettingsFromFile(fileName) reads the settings for a floorplan
 *   - Returns null if the file doesn't exist (caller should provide defaults)
 *
 * - writeSettingsToFile(settings) saves settings to a file
 *   - The filename is derived from settings.floorplanImageName
 *   - Sensitive data (sudoerPassword) is stripped before saving
 */

import { HeatmapSettings } from "./types";

export async function readSettingsFromFile(
  fileName: string,
): Promise<HeatmapSettings | null> {
  try {
    if (!fileName) {
      return null;
    }

    const response = await fetch(
      `/api/settings?name=${encodeURIComponent(fileName)}`,
    );

    if (response.status === 404) {
      return null; // Survey doesn't exist yet
    }

    if (!response.ok) {
      console.error("Error reading settings:", await response.text());
      return null;
    }

    const parsedData = await response.json();

    // Migration: Earlier versions used iperfResults instead of iperfData
    // Copy iperfResults to iperfData if present
    if (parsedData.surveyPoints?.[0]?.iperfResults !== undefined) {
      for (const point of parsedData.surveyPoints) {
        point.iperfData = point.iperfResults;
        delete point.iperfResults;
      }
    }

    return parsedData;
  } catch (error) {
    console.error("Error reading settings:", error);
    return null;
  }
}

export async function writeSettingsToFile(
  settings: HeatmapSettings,
): Promise<void> {
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      console.error("Error saving settings:", await response.text());
    }
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

