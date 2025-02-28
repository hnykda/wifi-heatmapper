import { Database } from "./types";

export const getDefaults = (): Database => {
  return {
    surveyPoints: [],
    floorplanImagePath: "foo.png",
    iperfServerAdrs: "127.0.0.1",
    apMapping: [],
    testDuration: 10,
    // dbPath: "",
    // platform: "",
  };
};

export async function readSettingsFromFile(): Promise<Database> {
  try {
    const data = localStorage.getItem("projectSettings"); // Simulating file storage
    return data ? JSON.parse(data) : getDefaults();
  } catch (error) {
    console.error("Error reading settings:", error);
    return getDefaults();
  }
}

export async function writeSettingsToFile(settings: Database): Promise<void> {
  try {
    localStorage.setItem("projectSettings", JSON.stringify(settings)); // Simulating file storage
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}
