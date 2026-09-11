/**
 * server-paths.ts - where wifi-heatmapper keeps its files on disk.
 *
 * All user data lives under one data directory (default: ./data):
 *
 *   data/surveys/<floorplan>.json   survey points + settings per floor plan
 *   data/media/<floorplan image>    uploaded floor plan images
 *
 * Set WIFI_HEATMAPPER_DATA_DIR to move the whole directory (used by the
 * e2e tests so they never touch a developer's real surveys).
 *
 * Localization tables ship with the app and stay in the repo's data/localization.
 */
import path from "path";

export function getDataDir(): string {
  const configured = process.env.WIFI_HEATMAPPER_DATA_DIR;
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "data");
}

export function getSurveysDir(): string {
  return path.join(getDataDir(), "surveys");
}

export function getMediaDir(): string {
  return path.join(getDataDir(), "media");
}

/** Floor plans bundled with the app, copied into the media dir on first start. */
export function getBundledFloorplansDir(): string {
  return path.join(process.cwd(), "assets", "floorplans");
}

/** Versions before 0.5.0 stored uploads here; they are migrated on start. */
export function getLegacyMediaDir(): string {
  return path.join(process.cwd(), "public", "media");
}

export function getLocalizationDir(): string {
  return path.join(process.cwd(), "data", "localization");
}

/**
 * Only allow plain file names (no path separators, no traversal, no dotfiles).
 * Returns null when the name is not acceptable.
 */
export function safeFileName(name: string): string | null {
  if (!name) return null;
  const base = path.basename(name);
  if (base !== name) return null;
  if (base === "." || base === ".." || base.startsWith(".")) return null;
  if (/[\\/\0]/.test(base)) return null;
  return base;
}

export const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

export function isImageFileName(name: string): boolean {
  return IMAGE_EXTENSIONS.test(name);
}

/**
 * Normalize an uploaded file name: keep letters, digits, space, dot, dash and
 * underscore; collapse anything else to "_".
 */
export function normalizeUploadName(name: string): string | null {
  const base = path.basename(name).trim();
  const cleaned = base.replace(/[^A-Za-z0-9 ._-]/g, "_").replace(/\s+/g, " ");
  return safeFileName(cleaned);
}

export function contentTypeFor(name: string): string {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export { mediaUrlFor } from "./media-url";
