import { HeatmapSettings } from "./types";

export async function readSettingsFromFile(): Promise<HeatmapSettings | null> {
  try {
    const data = localStorage.getItem("projectSettings"); // Simulating file storage
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error reading settings:", error);
    return null;
  }
}

export async function writeSettingsToFile(
  settings: HeatmapSettings,
): Promise<void> {
  try {
    // ensure the sudoerPassword is removed so it won't be written out
    const { sudoerPassword: _, ...noPWSettings } = settings;
    localStorage.setItem("projectSettings", JSON.stringify(noPWSettings)); // Simulating file storage
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}
