/**
 * survey-defaults.ts - what a new survey starts with. Shared by the server
 * (survey-store.ts, schema.ts) and the browser, without pulling Zod into
 * the browser bundle.
 */
import { defaultIperfCommands } from "./iperfUtils";
import { mediaUrlFor } from "./media-url";
import type { Gradient, SurveyDocument, WifiResults } from "./types";

export const defaultGradient = (): Gradient => ({
  0: "rgba(255, 0, 0, 0.6)", // Poor signal: 0%
  0.4: "rgba(255, 255, 0, 0.6)", // Warning: 40%
  0.7: "rgba(0, 255, 0, 0.6)", // Good signal: 70%
  1.0: "rgba(0, 255, 0, 0.6)", // Good signal: 100%
});
export const emptyWifiResults = (): WifiResults => ({
  ssid: "",
  bssid: "",
  rssi: 0,
  signalStrength: 0,
  channel: 0,
  band: 0,
  channelWidth: 0,
  txRate: 0,
  phyMode: "",
  security: "",
  currentSSID: false,
  strongestSSID: null,
});

/** A complete new survey for a floor plan ("" if not known yet). */
export function defaultSurvey(floorPlan: string): SurveyDocument {
  return {
    surveyPoints: [],
    floorplanImageName: floorPlan,
    floorplanImagePath: floorPlan ? mediaUrlFor(floorPlan) : "",
    measureSpeed: false, // new surveys measure signal only
    iperfServerAdrs: "",
    apMapping: [],
    testDuration: 5,
    udpTests: false, // TCP only: half the time per spot
    nextPointNum: 1,
    dimensions: { width: 100, height: 100 },
    radiusDivider: null,
    maxOpacity: 0.7,
    minOpacity: 0.2,
    blur: 0.99,
    gradient: defaultGradient(),
    heatmapRanges: {},
    iperfCommands: { ...defaultIperfCommands },
  };
}
