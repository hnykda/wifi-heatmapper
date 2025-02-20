export async function readSettingsFromFile(): Promise<HeatmapSettings> {
  try {
    const data = localStorage.getItem("projectSettings"); // Simulating file storage
    return data
      ? JSON.parse(data)
      : {
          theme: "light",
          autoSave: true,
          fontSize: 14,
          filePath: "/default/path",
        };
  } catch (error) {
    console.error("Error reading settings:", error);
    return {
      theme: "light",
      autoSave: true,
      fontSize: 14,
      filePath: "/default/path",
    };
  }
}

export async function writeSettingsToFile(
  settings: HeatmapSettings,
): Promise<void> {
  try {
    localStorage.setItem("projectSettings", JSON.stringify(settings)); // Simulating file storage
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}
