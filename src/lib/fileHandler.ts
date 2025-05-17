/**
 * wifi-heatmapper localStorage() rules:
 *
 * - There is always a "base" value (a string) named `wifi*heatmapper` that
 *    is the name of the floor plan that contains all the settings
 *    that were collected for that floor plan.
 * - There is also a wifi-heatmapper-floorplanImageName object
 *    that contains the survey points and other settings that
 *    match the floorplanImageName from the base value.
 *
 * - readSettingsFromFile(fileName) has three actions:
 *  - read the base `wifi*heatmapper` value to get the floorplanImageName
 *    - if it doesn't exist, return null, so the caller can provide default values
 *    - if the fileName doesn't match it, return null (same reason)
 *    - Otherwise, return the settings from the wifi-heatmapper-fileName object
 *
 * - writeSettingsToFile(fileName) has two actions:
 *  - update the base `wifi*heatmapper` value with the current fileName
 *  - update the wifi-heatmapper-fileName object with the passed-in settings
 */

import { HeatmapSettings } from "./types";

export async function readSettingsFromFile(
  fileName: string,
): Promise<HeatmapSettings | null> {
  try {
    let baseImageName = localStorage.getItem("wifi*heatmapper");
    // if no "wifi*heatmapper" value, nothing has been set up - simply return null
    // caller needs to fix things up
    if (baseImageName == null) {
      return null;
    }
    // if they provide a file to use, use that as the suffix for the localStorage() value
    // and remember that this is the file we're using
    if (fileName != "") {
      baseImageName = fileName;
      localStorage.setItem("wifi*heatmapper", baseImageName);
    }

    const localStorageName = `wifi-heatmapper-${baseImageName}`;
    const data = localStorage.getItem(localStorageName);
    return data ? JSON.parse(data) : null; // return the data or null (if doesn't exist)
  } catch (error) {
    console.error("Error reading settings:", error);
    return null;
  }
}

export async function writeSettingsToFile(
  settings: HeatmapSettings,
): Promise<void> {
  try {
    // update the base image name
    const baseImageName = settings.floorplanImageName;
    localStorage.setItem("wifi*heatmapper", baseImageName);

    // ensure the sudoerPassword is removed so it won't be written out
    // sudoerPassword is assigned to the "_" variable,
    // noPWSettings gets the "rest" of the properties
    // then write noPWSettings to localStorage()
    const { sudoerPassword: _, ...nonPWSettings } = settings;
    localStorage.setItem(
      `wifi-heatmapper-${baseImageName}`,
      JSON.stringify(nonPWSettings),
    );
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}
