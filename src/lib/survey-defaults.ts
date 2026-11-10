/**
 * survey-defaults.ts - what a new survey starts with. Shared by the server
 * (survey-store.ts, schema.ts) and the browser, without pulling Zod into
 * the browser bundle.
 */
import { defaultIperfCommands } from "./iperfUtils";
import { mediaUrlFor } from "./media-url";
import type { Gradient, SurveyDocument, WifiResults } from "./types";

/**
 * Signal strength colours: green is good, yellow is usable but shaky, red is
 * poor (issue #147). Percent is linear from -100 dBm (0%) to -40 dBm (100%).
 *
 * - Green from -67 dBm (55%): the usual minimum for reliable voice and video
 *   calls. Cisco's Wi-Fi phone deployment guides design the cell edge to
 *   -67 dBm, and Apple devices only roam to an access point at -67 dBm or
 *   better (support.apple.com/102002).
 * - Red below -76 dBm (40%): where WiFi Explorer's default scale turns red
 *   (its 40%), and close to the -75 dBm at which a Mac starts looking for a
 *   better access point.
 *
 * Each colour holds across its band and blends into the next over 3% (about
 * 2 dB) just below the threshold, so the edges read as contour lines rather
 * than a rainbow. The heat map's colour lookup (256 samples, linear
 * filtering) draws such short blends smoothly.
 */
export const defaultGradient = (): Gradient => ({
  0: "rgba(255, 0, 0, 0.6)", // 0%, -100 dBm: poor
  0.37: "rgba(255, 0, 0, 0.6)", // 37%, -78 dBm
  0.4: "rgba(255, 255, 0, 0.6)", // 40%, -76 dBm: usable from here
  0.52: "rgba(255, 255, 0, 0.6)", // 52%, -69 dBm
  0.55: "rgba(0, 255, 0, 0.6)", // 55%, -67 dBm: good from here
  1.0: "rgba(0, 255, 0, 0.6)", // 100%, -40 dBm
});

/**
 * Default gradients of earlier versions. A survey still on one of them never
 * chose its colours, so it gets the current default when it is read (see
 * `gradientLenient` in schema.ts). Custom gradients are kept.
 */
const PREVIOUS_DEFAULT_GRADIENTS: Gradient[] = [
  // October 2025 to 0.9.x: red, yellow, blue, cyan, green; green from 75%
  {
    0: "rgba(255, 0, 0, 0.6)",
    0.45: "rgba(255, 255, 0, 0.6)",
    0.5: "rgba(0, 0, 255, 0.6)",
    0.6: "rgba(0, 255, 255, 0.6)",
    0.75: "rgba(0, 255, 0, 0.6)",
    0.9: "rgba(0, 255, 0, 0.6)",
    1.0: "rgba(0, 255, 0, 0.6)",
  },
  // June to October 2025 (0.3.x)
  {
    0: "rgba(255, 0, 0, 0.6)",
    0.35: "rgba(255, 255, 0, 0.6)",
    0.4: "rgba(0, 0, 255, 0.6)",
    0.6: "rgba(0, 255, 255, 0.6)",
    0.9: "rgba(0, 255, 0, 0.6)",
    1.0: "rgba(0, 255, 0, 0.6)",
  },
];

/** Stops as sorted "position colour" pairs, ignoring spacing in the colour. */
function gradientKey(gradient: Gradient): string {
  return Object.entries(gradient)
    .map(([stop, colour]) => [Number(stop), colour.replace(/\s+/g, "")])
    .sort((a, b) => (a[0] as number) - (b[0] as number))
    .map(([stop, colour]) => `${stop} ${colour}`)
    .join(";");
}

/** True if `gradient` is the default of an earlier version. */
export function isPreviousDefaultGradient(gradient: Gradient): boolean {
  const key = gradientKey(gradient);
  return PREVIOUS_DEFAULT_GRADIENTS.some((g) => gradientKey(g) === key);
}

/** Reading-label size as a percentage of the map's caption font. */
export const defaultPointValueScale = 75;
/** Opacity of each reading label's background. */
export const defaultPointValueOpacity = 0.5;
/** Reading-label text colour (hex). */
export const defaultPointValueColor = "#14181f";

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
    accessPoints: [],
    testDuration: 5,
    udpTests: false, // TCP only: half the time per spot
    nextPointNum: 1,
    dimensions: { width: 100, height: 100 },
    radiusDivider: null,
    maxOpacity: 0.7,
    minOpacity: 0.2,
    blur: 0.99,
    showPointValues: false,
    pointValueScale: defaultPointValueScale,
    pointValueOpacity: defaultPointValueOpacity,
    pointValueColor: defaultPointValueColor,
    gradient: defaultGradient(),
    heatmapRanges: {},
    iperfCommands: { ...defaultIperfCommands },
  };
}
