import React, { useCallback, useEffect, useRef, useState } from "react";

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
import HeatmapAdvancedConfig, { HeatmapConfig } from "./HeatmapAdvancedConfig";
import { Download } from "lucide-react";

import { IperfTestProperty } from "@/lib/types";
import {
  metricFormatter,
  percentageToRssi,
  rssiToPercentage,
} from "@/lib/utils";
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

interface HeatmapProps {
  points: SurveyPoint[];
  dimensions: { width: number; height: number };
  image: string;
}

export const Heatmaps: React.FC<HeatmapProps> = ({
  points,
  dimensions,
  image,
}) => {
  // const { settings, updateSettings, surveyPointActions } = useSettings();

  // console.log(`Dimensions: ${JSON.stringify(dimensions)}`);

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

  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>({
    radiusDivider: 1,
    maxOpacity: 0.7,
    minOpacity: 0.2,
    blur: 0.99,
    gradient: {
      0: "rgba(255, 0, 0, 0.6)",
      0.35: "rgba(255, 255, 0, 0.6)",
      // 0.5: "rgba(0, 0, 0, 0.6)",
      0.4: "rgba(0, 0, 255, 0.6)",
      0.6: "rgba(0, 255, 255, 0.6)",
      1.0: "rgba(0, 255, 0, 0.6)",
    },
    //  gradient: {
    //   0.05: "rgba(0, 0, 0, 0.6)", // throw some grey in there
    //   0.1: "rgba(0, 0, 255, 0.6)", // 40%, -80 dBm
    //   0.25: "rgba(0, 255, 255, 0.6)", // 60%, -70 dBm
    //   0.5: "rgba(0, 255, 0, 0.6)", // 70%, -60 dBm
    //   0.75: "rgba(255, 255, 0, 0.6)", // 85%, -50 dBm
    //   1.0: "rgba(255, 0, 0, 0.6)", // 100%, -40 dBm
    // },
  });

  const getMetricValue = useCallback(
    (
      point: SurveyPoint,
      metric: MeasurementTestType,
      testType?: keyof IperfTestProperty,
    ): number => {
      switch (metric) {
        case "signalStrength":
          return showSignalStrengthAsPercentage
            ? point.wifiData.signalStrength ||
                rssiToPercentage(point.wifiData.rssi)
            : point.wifiData.rssi ||
                percentageToRssi(point.wifiData.signalStrength);
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
    [showSignalStrengthAsPercentage],
  );

  const generateHeatmapData = useCallback(
    (metric: MeasurementTestType, testType?: keyof IperfTestProperty) => {
      const data = points
        .filter((p) => p.isEnabled)
        .map((point) => {
          const value = getMetricValue(point, metric, testType);
          return value !== null ? { x: point.x, y: point.y, value } : null;
        })
        .filter((point) => point !== null);

      const allSameValue = data.every((point) => point.value === data[0].value);
      if (allSameValue) {
        logger.info(
          `Values for all selected points for ${metric}${testType ? `-${testType}` : ""} are the same: ${data[0].value}.
          It's not a problem, but the heatmap will be less interesting.`,
        );
      }

      return data;
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

  const renderHeatmap = useCallback(
    (
      metric: MeasurementTestType,
      testType?: keyof IperfTestProperty,
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        if (
          dimensions.width === 0 ||
          dimensions.height === 0 ||
          !offScreenContainerRef.current
        ) {
          logger.error(
            "Image dimensions not set or off-screen container not available",
          );
          resolve(null);
          return;
        }

        const heatmapData = generateHeatmapData(metric, testType);

        if (!heatmapData || heatmapData.length === 0) {
          logger.info(
            `No valid data for ${metric}${testType ? `-${testType}` : ""}`,
          );
          resolve(null);
          return;
        }

        const heatmapContainer = document.createElement("div");
        heatmapContainer.style.width = `${dimensions.width}px`;
        heatmapContainer.style.height = `${dimensions.height}px`;

        offScreenContainerRef.current.appendChild(heatmapContainer);

        // density is the "amount of space" taken up by points in the heatmap
        // if points were spread evenly, they'd take (h x w) / (# points) pixels.
        // take the square root of the # pixels to get average X & Y
        // and throw in a fudge factor just because ... :-)
        const numPoints = heatmapData.length;
        const newDivider = Math.sqrt(
          (0.9 * (dimensions.width * dimensions.height)) / numPoints,
        );
        // heatmapConfig.radiusDivider = newDivider;
        // setHeatmapConfig(heatmapConfig);

        const heatmapInstance = h337.create({
          container: heatmapContainer,
          radius:
            Math.min(dimensions.width, dimensions.height) /
            heatmapConfig.radiusDivider,
          // newDivider,
          maxOpacity: heatmapConfig.maxOpacity,
          minOpacity: heatmapConfig.minOpacity,
          blur: heatmapConfig.blur,
          gradient: heatmapConfig.gradient,
        });

        // const max = Math.max(...heatmapData.map((point) => point.value));
        // const min = Math.min(...heatmapData.map((point) => point.value));
        const max = 100;
        const min = 0;

        heatmapInstance.setData({
          max: max,
          min: min,
          data: heatmapData,
        });

        const colorBarWidth = 50;
        const labelWidth = 150; // Width allocated for labels
        const canvasRightPadding = 20; // Padding on the right side of the canvas

        const canvas = document.createElement("canvas");
        canvas.width =
          dimensions.width + colorBarWidth + labelWidth + canvasRightPadding;
        canvas.height = dimensions.height + 40;
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
         * load the background image
         */
        const backgroundImage = new Image();
        backgroundImage.onload = () => {
          ctx.drawImage(
            backgroundImage,
            0,
            20,
            dimensions.width,
            dimensions.height,
          );

          const heatmapCanvas = heatmapContainer.querySelector("canvas");
          if (heatmapCanvas) {
            if (heatmapCanvas.width === 0 || heatmapCanvas.height === 0) {
              logger.error("Heatmap canvas has zero width or height");
              offScreenContainerRef.current?.removeChild(heatmapContainer);
              resolve(null);
              return;
            }
            ctx.drawImage(heatmapCanvas, 0, 20);

            // Draw color bar
            const colorBarWidth = 50; // Increased width
            const colorBarHeight = dimensions.height;
            const colorBarX = dimensions.width + 40; // Adjusted position
            const colorBarY = 20;

            const gradient = ctx.createLinearGradient(
              0,
              colorBarY + colorBarHeight,
              0,
              colorBarY,
            );
            Object.entries(heatmapConfig.gradient).forEach(([stop, color]) => {
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
        backgroundImage.src = image;
      });
    },
    [dimensions, generateHeatmapData, image, heatmapConfig],
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
    if (dimensions.width > 0 && dimensions.height > 0) {
      generateAllHeatmaps();
    }
  }, [
    dimensions,
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

      <HeatmapAdvancedConfig
        config={heatmapConfig}
        setConfig={setHeatmapConfig}
      />
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
};
