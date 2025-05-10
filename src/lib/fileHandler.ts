import { HeatmapSettings } from "./types";

export async function readSettingsFromFile(): Promise<HeatmapSettings | null> {
  try {
    const data = localStorage.getItem("wifi-heatmapper"); // Simulating file storage
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
    // sudoerPassword is assigned to the "_" variable,
    // noPWSettings gets the "rest" of the properties
    // then write noPWSettings to localStorage()
    const { sudoerPassword: _, ...noPWSettings } = settings;
    localStorage.setItem("wifi-heatmapper", JSON.stringify(noPWSettings)); // Simulating file storage
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}
