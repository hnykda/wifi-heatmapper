import React, { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/components/GlobalSettings";

import { calculateRadiusByBoundingBox } from "../lib/radiusCalculations";

import h337 from "heatmap.js";
import {
  SurveyPoint,
  testProperties,
  MeasurementTestType,
  testTypes,
} from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Download } from "lucide-react";
import { HeatmapSlider } from "./Slider";

import { IperfTestProperty } from "@/lib/types";
import { metricFormatter } from "@/lib/utils";
import { getLogger } from "@/lib/logger";

const logger = getLogger("Heatmaps");

const metricTitles: Record<MeasurementTestType, string> = {
  signalStrength: "Signal Strength",
  tcpDownload: "TCP Download",
  tcpUpload: "TCP Upload",
  udpDownload: "UDP Download",
  udpUpload: "UDP Upload",
};

const propertyTitles: Record<keyof IperfTestProperty, string> = {
  bitsPerSecond: "Bits Per Second [Mbps]",
  jitterMs: "Jitter [ms] (UDP Only)",
  lostPackets: "Lost Packets (UDP Only)",
  retransmits: "Retransmits (TCP Download Only)",
  packetsReceived: "Packets Received (UDP Only)",
};

const getAvailableProperties = (
  metric: MeasurementTestType,
): (keyof IperfTestProperty)[] => {
  switch (metric) {
    case "tcpDownload":
      return ["bitsPerSecond", "retransmits"];
    case "tcpUpload":
      return ["bitsPerSecond"];
    case "udpDownload":
    case "udpUpload":
      return ["bitsPerSecond", "jitterMs", "lostPackets", "packetsReceived"];
    default:
      return [];
  }
};

/**
 * Heatmaps component - this is responsible for drawing all the heat maps
 * that are selected in the checkboxes
 * @returns the rendered heat maps
 */
export function Heatmaps() {
  const { settings, updateSettings } = useSettings();

  // array of surveyPoints passed in props
  const points = settings.surveyPoints;

  const [heatmaps, setHeatmaps] = useState<{ [key: string]: string | null }>(
    {},
  );
  const [selectedHeatmap, setSelectedHeatmap] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  const [selectedMetrics, setSelectedMetrics] = useState<MeasurementTestType[]>(
    ["signalStrength", "tcpDownload", "tcpUpload"],
  );
  const [selectedProperties, setSelectedProperties] = useState<
    (keyof IperfTestProperty)[]
  >(["bitsPerSecond"]);

  const [showSignalStrengthAsPercentage, setShowSignalStrengthAsPercentage] =
    useState(true);

  // const r1 = calculateRadiusByDensity; // bad for small numbers of points
  const r2 = calculateRadiusByBoundingBox;
  // const r3 = calculateOptimalRadius; // bad for small numbers of points

  const displayedRadius = settings.radiusDivider // if settings value is non-null
    ? settings.radiusDivider // use it
    : Math.round(r2(points));

  const handleRadiusChange = (r: number) => {
    let savedVal: number | null = null;
    if (r != 0) {
      savedVal = r;
    }
    updateSettings({ radiusDivider: savedVal });
  };

  /**
   * getMetricValue - return the number for the metric and test type
   * for the designated point
   * @param point - the survey point
   * @param metric - name of the property to return
   * @param testType - if it's an iperf3 result, which one?
   * @returns number
   */
  const getMetricValue = useCallback(
    (
      point: SurveyPoint,
      metric: MeasurementTestType,
      testType?: keyof IperfTestProperty,
    ): number => {
      switch (metric) {
        case "signalStrength": // data collection always captures both values
          return showSignalStrengthAsPercentage
            ? point.wifiData.signalStrength
            : point.wifiData.rssi;
        case "tcpDownload":
        case "tcpUpload":
        case "udpDownload":
        case "udpUpload":
          return testType
            ? point.iperfResults[metric][testType] || 0
            : point.iperfResults[metric].bitsPerSecond;
        default:
          return 0;
      }
    },
    [showSignalStrengthAsPercentage, settings.radiusDivider],
  );

  /**
   * generateHeatmapData - take the component's array of points and the descriptors
   *   and return an array of non-null and non-zero (if iperf results) data points
   * @param metric - which measurement
   * @param testType - which of the iperf3 test results
   * @returns array of {x, y, value}
   */
  const generateHeatmapData = useCallback(
    (metric: MeasurementTestType, testType?: keyof IperfTestProperty) => {
      const data = points
        .filter((p) => p.isEnabled)
        .map((point) => {
          const value = getMetricValue(point, metric, testType);
          return value !== null ? { x: point.x, y: point.y, value } : null;
        })
        .filter((point) => point !== null);

      // Filter out zero values for the iperf results
      switch (metric) {
        case "tcpDownload":
        case "tcpUpload":
        case "udpDownload":
        case "udpUpload":
          // return data;
          return data.filter((p) => p.value != 0);
        default:
          return data;
      }
    },
    [points, getMetricValue],
  );

  const offScreenContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create an off-screen container for heatmap generation
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    document.body.appendChild(container);
    offScreenContainerRef.current = container;

    return () => {
      if (offScreenContainerRef.current) {
        document.body.removeChild(offScreenContainerRef.current);
      }
    };
  }, []);

  const formatValue = useCallback(
    (
      value: number,
      metric: MeasurementTestType,
      testType?: keyof IperfTestProperty,
    ): string => {
      return metricFormatter(
        value,
        metric,
        testType,
        showSignalStrengthAsPercentage,
      );
    },
    [showSignalStrengthAsPercentage],
  );

  /**
   * drawColorBar - take the parameters and create the color gradient
   */
  function drawColorBar(ctx, w, h, x, y, min, max, metric, testType) {
    const colorBarWidth = 50; // Increased width
    const colorBarHeight = settings.dimensions.height;
    const colorBarX = settings.dimensions.width + 40; // Adjusted position
    const colorBarY = 20;

    const gradient = ctx.createLinearGradient(0, h + y, 0, y);
    Object.entries(settings.gradient).forEach(([stop, color]) => {
      gradient.addColorStop(parseFloat(stop), color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(colorBarX, colorBarY, colorBarWidth, colorBarHeight);

    // Add ticks and labels
    const numTicks = 10;
    ctx.fillStyle = "black";
    ctx.font = "14px Arial"; // Increased font size
    ctx.textAlign = "left";

    for (let i = 0; i <= numTicks; i++) {
      const y = colorBarY + (colorBarHeight * i) / numTicks;
      const value = max - ((max - min) * i) / numTicks;
      const label = formatValue(value, metric, testType);

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(colorBarX, y);
      ctx.lineTo(colorBarX + 10, y);
      ctx.stroke();

      // Draw label
      ctx.fillText(label, colorBarX + colorBarWidth + 15, y + 5);
    }
  }

  /**
   * renderHeatmap - top-level code to draw a single heat map
   *   including floor plan, scale on the side, and the heat map
   *   or diagnostic info about why it wasn't drawn
   * @param metric - signalStrength or one of the iperf3 tests
   * @param testType - which of the iperf3 tests
   * @returns none - result is that heat map has been drawn
   */
  const renderHeatmap = useCallback(
    (
      metric: MeasurementTestType,
      testType?: keyof IperfTestProperty,
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        // preconditions
        if (
          settings.dimensions.width === 0 ||
          settings.dimensions.height === 0 ||
          !offScreenContainerRef.current
        ) {
          logger.error(
            "Image dimensions not set or off-screen container not available",
          );
          resolve(null);
          return;
        }

        // prep the container - check for problems
        const colorBarWidth = 50;
        const labelWidth = 150; // Width allocated for labels
        const canvasRightPadding = 20; // Padding on the right side of the canvas

        const heatmapContainer = document.createElement("div");
        heatmapContainer.style.width = `${settings.dimensions.width}px`;
        heatmapContainer.style.height = `${settings.dimensions.height}px`;

        offScreenContainerRef.current.appendChild(heatmapContainer);

        const canvas = document.createElement("canvas");
        canvas.width =
          settings.dimensions.width +
          colorBarWidth +
          labelWidth +
          canvasRightPadding;
        canvas.height = settings.dimensions.height + 40;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          logger.error("Failed to get 2D context");
          offScreenContainerRef.current.removeChild(heatmapContainer);
          resolve(null);
          return;
        }

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        /**
         * pick out the values to be used for the heat map
         */
        const heatmapData = generateHeatmapData(metric, testType);

        if (!heatmapData || heatmapData.length === 0) {
          ctx.font = "120px sans-serif";
          ctx.fillStyle = "black";
          ctx.fillText(
            `Hello, world! ${heatmapData.length}`,
            100,
            (settings.dimensions.height * 2) / 3,
          ); // (x=20, y=40)
          // resolve(null);
          // return;
        }

        // create the heat map instance
        const heatmapInstance = h337.create({
          container: heatmapContainer,
          radius: !settings.radiusDivider
            ? displayedRadius
            : settings.radiusDivider,
          maxOpacity: settings.maxOpacity,
          minOpacity: settings.minOpacity,
          blur: settings.blur,
          gradient: settings.gradient,
        });

        // const max = Math.max(...heatmapData.map((point) => point.value));
        // const min = Math.min(...heatmapData.map((point) => point.value));
        // Hard-code to 0..100 for Wi-Fi heat map
        const max = 100;
        const min = 0;

        // connect the data to the heatmapInstance
        heatmapInstance.setData({
          max: max,
          min: min,
          data: heatmapData,
        });

        /**
         * Start the actual drawing...
         */
        const backgroundImage = new Image();
        backgroundImage.onload = () => {
          ctx.drawImage(
            backgroundImage,
            0,
            20,
            settings.dimensions.width,
            settings.dimensions.height,
          );
          const heatmapCanvas = heatmapContainer.querySelector("canvas");
          if (heatmapCanvas) {
            if (heatmapCanvas.width === 0 || heatmapCanvas.height === 0) {
              logger.error("Heatmap canvas has zero width or height");
              offScreenContainerRef.current?.removeChild(heatmapContainer);
              resolve(null);
              return;
            }

            /**
             * Draw the actual heat map
             */
            ctx.drawImage(heatmapCanvas, 0, 20);

            /**
             * Add note if there are no iperf3 measurements
             */
            if (!heatmapData || heatmapData.length === 0) {
              const lines = ["No heatmap:", `no ${metric}`, "tests performed"];
              ctx.textAlign = "center";
              ctx.font = "72px sans-serif";
              ctx.fillStyle = "black";

              lines.forEach((line, index) => {
                ctx.fillText(
                  line,
                  settings.dimensions.width / 2,
                  (settings.dimensions.height * 2) / 3 + index * 72,
                );
              });
            }

            /**
             * Draw the color bar/gradient on the right
             */
            drawColorBar(
              ctx,
              50,
              settings.dimensions.height,
              settings.dimensions.width + 40,
              20,
              min,
              max,
              metric,
              testType,
            );

            try {
              if (offScreenContainerRef.current?.contains(heatmapContainer)) {
                offScreenContainerRef.current.removeChild(heatmapContainer);
              }
            } catch (error) {
              logger.error("Error removing heatmap container:", error);
            }

            resolve(canvas.toDataURL());
          } else {
            logger.error("Heatmap canvas not found");
            try {
              if (offScreenContainerRef.current?.contains(heatmapContainer)) {
                offScreenContainerRef.current.removeChild(heatmapContainer);
              }
            } catch (error) {
              logger.error("Error removing heatmap container:", error);
            }
            resolve(null);
          }
        };
        backgroundImage.src = settings.floorplanImagePath;
      });
    },
    [
      settings.dimensions,
      generateHeatmapData,
      settings.floorplanImagePath,
      settings,
    ],
  );

  const generateAllHeatmaps = useCallback(async () => {
    const newHeatmaps: { [key: string]: string | null } = {};
    for (const metric of selectedMetrics) {
      if (metric === "signalStrength") {
        newHeatmaps[metric] = await renderHeatmap(metric);
      } else {
        const availableProperties = getAvailableProperties(metric);
        for (const testType of selectedProperties) {
          if (availableProperties.includes(testType)) {
            const heatmapData = generateHeatmapData(metric, testType);
            if (heatmapData) {
              newHeatmaps[`${metric}-${testType}`] = await renderHeatmap(
                metric,
                testType,
              );
            }
          }
        }
      }
    }
    setHeatmaps(newHeatmaps);
  }, [renderHeatmap, selectedMetrics, selectedProperties, generateHeatmapData]);

  const openHeatmapModal = (src: string, alt: string) => {
    setSelectedHeatmap({ src, alt });
  };

  const closeHeatmapModal = () => {
    setSelectedHeatmap(null);
  };

  const downloadImage = (imageUrl: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const HeatmapImage: React.FC<{
    src: string;
    alt: string;
    onClick: () => void;
  }> = ({ src, alt, onClick }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img
          src={src}
          alt={alt}
          className="w-full rounded-md shadow-sm cursor-pointer transition-transform hover:scale-105"
          onClick={onClick}
        />
        {isHovered && (
          <div
            className="absolute top-2 right-2 p-2 bg-gray-800 bg-opacity-50 rounded-full cursor-pointer transition-opacity hover:bg-opacity-75"
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(src, `${alt.replace(/\s+/g, "_")}.png`);
            }}
          >
            <Download className="h-5 w-5 text-white" />
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (settings.dimensions.width > 0 && settings.dimensions.height > 0) {
      generateAllHeatmaps();
    }
  }, [
    settings.dimensions,
    generateAllHeatmaps,
    points,
    selectedMetrics,
    selectedProperties,
    showSignalStrengthAsPercentage,
  ]);

  const toggleMetric = (metric: MeasurementTestType) => {
    setSelectedMetrics((prev) => {
      const newMetrics = prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric];
      return newMetrics.sort(
        (a, b) =>
          Object.values(testTypes).indexOf(a) -
          Object.values(testTypes).indexOf(b),
      );
    });
  };

  const toggleProperty = (property: keyof IperfTestProperty) => {
    setSelectedProperties((prev) => {
      const newProperties = prev.includes(property)
        ? prev.filter((p) => p !== property)
        : [...prev, property];
      return newProperties.sort(
        (a, b) =>
          Object.values(testProperties).indexOf(a) -
          Object.values(testProperties).indexOf(b),
      );
    });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">Heatmaps</h2>

      <div className="mb-4">
        <h3 className="text-lg font-medium mb-2 text-gray-700">
          Select Metrics
        </h3>
        <div className="flex flex-wrap gap-4">
          {Object.values(testTypes).map((metric) => (
            <div key={metric} className="flex items-center space-x-2">
              <Checkbox
                id={`metric-${metric}`}
                checked={selectedMetrics.includes(metric)}
                onCheckedChange={() => toggleMetric(metric)}
              />
              <label
                htmlFor={`metric-${metric}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {metricTitles[metric]}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2 text-gray-700">
          Select Properties
        </h3>
        <div className="flex flex-wrap gap-4">
          {Object.values(testProperties).map((property) => (
            <div key={property} className="flex items-center space-x-2">
              <Checkbox
                id={`property-${property}`}
                checked={selectedProperties.includes(property)}
                onCheckedChange={() => toggleProperty(property)}
              />
              <label
                htmlFor={`property-${property}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {propertyTitles[property]}
              </label>
            </div>
          ))}
        </div>
      </div>

      <HeatmapSlider value={displayedRadius} onChange={handleRadiusChange} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {selectedMetrics.map((metric) => (
          <div key={metric} className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium mb-3 text-gray-700">
              {metricTitles[metric]}
            </h3>
            {metric === "signalStrength" ? (
              heatmaps[metric] && (
                <div>
                  <div className="mb-4 flex items-center space-x-2">
                    <Switch
                      id="signal-strength-percentage"
                      checked={showSignalStrengthAsPercentage}
                      onCheckedChange={setShowSignalStrengthAsPercentage}
                    />
                    <label
                      htmlFor="signal-strength-percentage"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Show Signal Strength as Percentage
                    </label>
                  </div>
                  <HeatmapImage
                    src={heatmaps[metric]}
                    alt={`Heatmap for ${metricTitles[metric]}`}
                    onClick={() =>
                      openHeatmapModal(
                        heatmaps[metric]!,
                        `Heatmap for ${metricTitles[metric]}`,
                      )
                    }
                  />
                </div>
              )
            ) : (
              <div className="space-y-4">
                {selectedProperties.map((testType) => {
                  const heatmap = heatmaps[`${metric}-${testType}`];
                  if (!heatmap) {
                    return null;
                  }
                  const alt = `Heatmap for ${metricTitles[metric]} - ${propertyTitles[testType]}`;
                  return (
                    <div key={`${metric}-${testType}`}>
                      <h4 className="text-sm font-medium mb-2 text-gray-600">
                        {propertyTitles[testType]}
                      </h4>
                      <HeatmapImage
                        src={heatmap}
                        alt={alt}
                        onClick={() => openHeatmapModal(heatmap, alt)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={selectedHeatmap !== null} onOpenChange={closeHeatmapModal}>
        <DialogContent className="max-w-6xl" aria-describedby="heatmap-modal">
          <DialogHeader>
            <DialogTitle>{selectedHeatmap?.alt}</DialogTitle>
          </DialogHeader>
          {selectedHeatmap && (
            <div className="relative">
              <img
                src={selectedHeatmap.src}
                alt={selectedHeatmap.alt}
                className="w-full h-auto"
              />
              <div
                className="absolute -top-[3rem] right-3 p-2 bg-gray-800 bg-opacity-50 rounded-full cursor-pointer transition-opacity hover:bg-opacity-75"
                onClick={() =>
                  downloadImage(
                    selectedHeatmap.src,
                    `${selectedHeatmap.alt.replace(/\s+/g, "_")}.png`,
                  )
                }
              >
                <Download className="h-6 w-6 text-white" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
