"use server";

import { readdirSync, readFileSync } from "fs";
import { join } from "path";

type LocalizationMap = Record<string, string>;
const reverseMap: Map<string, string> = new Map();

/**
 * initLocalization() - reads the files from _data/localization_
 * builds a "reverse map" then returns it so the caler
 * can look up (localized) strings to get canonical names
 * @returns "reverse map"
 */
export async function initLocalization(): Promise<Map<string, string>> {
  const localizationDir = join("data", "localization");
  // console.log(`__dirname: ${__dirname}`);
  // console.log(`localization dir: ${localizationDir}`);

  const files = readdirSync(localizationDir).filter((f) => f.endsWith(".json"));

  // Build a reverse map: value -> key
  for (const file of files) {
    try {
      const filePath = join(localizationDir, file);

      // Read and strip comment lines from the .json files
      const raw = readFileSync(filePath, "utf-8");
      const cleaned = raw
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

      const content: LocalizationMap = JSON.parse(cleaned);

      for (const [key, value] of Object.entries(content)) {
        if (!reverseMap.has(value)) {
          reverseMap.set(value, key); // First match wins
        } else {
          // console.log(`localization value: ${value} key: ${key} duplicate `);
        }
      }
    } catch {
      // Ignore a bad file and simply log it
      console.log(`*** Error reading localization file: ${file}`);
    }
  }
  return reverseMap;
}

// async lookup that the client could call.
// May not be necessary now that the init function returns the map
export async function reverseLookup(term: string): Promise<string | null> {
  return reverseMap.get(term) ?? null;
}

//
export async function getReverseLookupMap(): Promise<Map<string, string>> {
  return reverseMap;
}
