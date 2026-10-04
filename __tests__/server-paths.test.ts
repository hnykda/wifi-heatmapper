import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBundledFloorplansDir,
  getDataDir,
  getLocalizationDir,
  getMediaDir,
  getSurveysDir,
} from "../src/lib/server-paths";

// The desktop app runs the server from a read-only bundle and passes these
// two variables (desktop/src-tauri/src/main.rs); browser mode sets neither.
describe("server paths", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the working directory (browser mode)", () => {
    vi.stubEnv("WIFI_HEATMAPPER_DATA_DIR", "");
    vi.stubEnv("WIFI_HEATMAPPER_RESOURCES_DIR", "");
    const cwd = process.cwd();
    expect(getDataDir()).toBe(path.join(cwd, "data"));
    expect(getBundledFloorplansDir()).toBe(
      path.join(cwd, "assets", "floorplans"),
    );
    expect(getLocalizationDir()).toBe(path.join(cwd, "data", "localization"));
  });

  it("keeps user data and shipped files apart in the desktop app", () => {
    const data = path.resolve("/app-data/data");
    const resources = path.resolve("/bundle/server");
    vi.stubEnv("WIFI_HEATMAPPER_DATA_DIR", data);
    vi.stubEnv("WIFI_HEATMAPPER_RESOURCES_DIR", resources);
    expect(getSurveysDir()).toBe(path.join(data, "surveys"));
    expect(getMediaDir()).toBe(path.join(data, "media"));
    expect(getBundledFloorplansDir()).toBe(
      path.join(resources, "assets", "floorplans"),
    );
    expect(getLocalizationDir()).toBe(
      path.join(resources, "data", "localization"),
    );
  });
});
