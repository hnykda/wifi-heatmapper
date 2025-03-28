import { readdirSync, readFileSync } from "fs";
import { join } from "path";

type LocalizationMap = Record<string, string>;
const reverseMap: Map<string, string> = new Map();

export async function initLocalization() {
  const rootPath = process.cwd();
  const localizationDir = join(rootPath, "data", "localization");
  // console.log(`localization dir: ${localizationDir}`);
  const files = readdirSync(localizationDir).filter((f) => f.endsWith(".json"));

  // Build a reverse map: value -> key
  for (const file of files) {
    const filePath = join(localizationDir, file);

    // 🔥 Read and strip comment lines from the .json files
    const raw = readFileSync(filePath, "utf-8");
    const cleaned = raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    const content: LocalizationMap = JSON.parse(cleaned);

    for (const [key, value] of Object.entries(content)) {
      if (!reverseMap.has(value)) {
        reverseMap.set(value, key); // First match wins
        // console.log(`localization value: ${value} key: ${key} `);
      } else {
        // console.log(`localization value: ${value} key: ${key} duplicate `);
      }
    }
  }
}

export async function reverseLookup(term: string): Promise<string | null> {
  return reverseMap.get(term) ?? null;
}
