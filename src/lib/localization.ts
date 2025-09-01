"use server";

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { LocalizerMap } from "./types";

/**
 * initLocalization() - reads the files from _data/localization_
 * builds an object whose properties are the localized strings
 * from the `netsh ...` command, the values are the internal names
 * e.g. ssid, bssid, txRate, etc.
 * @returns localizer object
 */

export async function initLocalization(): Promise<LocalizerMap> {
  const localizationDir = join("data", "localization");
  // console.log(`__dirname: ${__dirname}`);
  // console.log(`localization dir: ${localizationDir}`);

  const files = readdirSync(localizationDir).filter((f) => f.endsWith(".json"));

  const localizer: LocalizerMap = {};

  // Build the object "localizedPhrase": "internal name"
  for (const file of files) {
    try {
      const filePath = join(localizationDir, file);
      // console.log(`File: ${filePath}`);
      // Read and strip comment lines from the .json files
      const raw = readFileSync(filePath, "utf-8");
      const cleaned = raw
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

      const content = JSON.parse(cleaned);
      for (const [key, value] of Object.entries(content)) {
        addPropertyWithConflictCheck(localizer, String(key), value);
      }
    } catch (err) {
      // Ignore a bad file and simply log it
      console.log(`*** Error reading localization file: ${file} (${err})`);
    }
  }
  return localizer;
}

/**
 * addPropertyWithConflictCheck() add a property to the localizer
 *   ensuring that an existing property maps to the same internal name
 * @param target - the localizer object
 * @param key - key (localized phrase) to add
 * @param value - internal name
 */
function addPropertyWithConflictCheck<T extends object>(
  target: T,
  key: keyof T,
  value: T[keyof T],
): void {
  if (key in target) {
    if (target[key] != value) {
      throw new Error(
        `Conflict for '${String(key)}': existing=${target[key]}, incoming=${value}`,
      );
    }
  } else {
    target[key] = value;
  }
}
