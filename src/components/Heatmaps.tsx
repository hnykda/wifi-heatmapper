import React, { useCallback, useEffect, useRef, useState } from "react";
import h337 from "heatmap.js";
import { SurveyPoint, IperfTest } from "../lib/database";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import HeatmapAdvancedConfig, { HeatmapConfig } from "./HeatmapAdvancedConfig";

type MetricType =
  | "signalStrength"
  | "tcpDownload"
  | "tcpUpload"
  | "udpDownload"
  | "udpUpload";

const metricTypes: MetricType[] = [
  "signalStrength",
  "tcpDownload",
  "tcpUpload",
  "udpDownload",
  "udpUpload",
];

const testProperties: (keyof IperfTest)[] = [
  "bitsPerSecond",
  "jitterMs",
  "lostPackets",
  "retransmits",
  "packetsReceived",
];

const metricTitles: Record<MetricType, string> = {
  signalStrength: "Signal Strength",
  tcpDownload: "TCP Download",
  tcpUpload: "TCP Upload",
  udpDownload: "UDP Download",
  udpUpload: "UDP Upload",
};

const propertyTitles: Record<keyof IperfTest, string> = {
  bitsPerSecond: "Bits Per Second [Mbps]",
  jitterMs: "Jitter [ms]",
  lostPackets: "Lost Packets",
  retransmits: "Retransmits",
  packetsReceived: "Packets Received",
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
  const [heatmaps, setHeatmaps] = useState<{ [key: string]: string | null }>(
    {},
  );
  const [selectedHeatmap, setSelectedHeatmap] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>([
    "signalStrength",
    "tcpDownload",
    "tcpUpload",
  ]);
  const [selectedProperties, setSelectedProperties] = useState<
    (keyof IperfTest)[]
  >(["bitsPerSecond"]);
  const [showSignalStrengthAsPercentage, setShowSignalStrengthAsPercentage] =
    useState(true);

  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>({
    radiusDivider: 3,
    maxOpacity: 0.7,
    minOpacity: 0.2,
    blur: 0.99,
    gradient: {
      ".0": "blue",
      ".4": "green",
      "0.6": "yellow",
      ".8": "red",
    },
  });

  const rssiToPercentage = (rssi: number): number => {
    if (rssi <= -100) return 0;
    if (rssi >= -50) return 100;
    return 2 * (rssi + 100);
  };

  const getMetricValue = useCallback(
    (
      point: SurveyPoint,
      metric: MetricType,
      testType?: keyof IperfTest,
    ): number => {
      switch (metric) {
        case "signalStrength":
          return showSignalStrengthAsPercentage
            ? rssiToPercentage(point.wifiData.rssi)
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
    [showSignalStrengthAsPercentage],
  );

  const generateHeatmapData = useCallback(
    (metric: MetricType, testType?: keyof IperfTest) => {
      return points.map((point) => ({
        x: point.x,
        y: point.y,
        value: getMetricValue(point, metric, testType),
      }));
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
      // Clean up the off-screen container on component unmount
      if (offScreenContainerRef.current) {
        document.body.removeChild(offScreenContainerRef.current);
      }
    };
  }, []);

  const renderHeatmap = useCallback(
    (
      metric: MetricType,
      testType?: keyof IperfTest,
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        if (
          dimensions.width === 0 ||
          dimensions.height === 0 ||
          !offScreenContainerRef.current
        ) {
          console.error(
            "Image dimensions not set or off-screen container not available",
          );
          resolve(null);
          return;
        }

        const heatmapData = generateHeatmapData(metric, testType);
        const heatmapContainer = document.createElement("div");
        heatmapContainer.style.width = `${dimensions.width}px`;
        heatmapContainer.style.height = `${dimensions.height}px`;

        offScreenContainerRef.current.appendChild(heatmapContainer);

        const heatmapInstance = h337.create({
          container: heatmapContainer,
          radius: Math.min(dimensions.width, dimensions.height) / 3,
          maxOpacity: 0.7,
          minOpacity: 0.2,
          blur: 0.99,
          gradient: {
            ".0": "blue",
            ".4": "green",
            "0.6": "yellow",
            ".8": "red",
          },
        });

        const max = Math.max(...heatmapData.map((point) => point.value));
        const min = Math.min(...heatmapData.map((point) => point.value));

        heatmapInstance.setData({
          max: max,
          min: min,
          data: heatmapData,
        });

        const canvas = document.createElement("canvas");
        canvas.width = dimensions.width + 100;
        canvas.height = dimensions.height + 40;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("Failed to get 2D context");
          offScreenContainerRef.current.removeChild(heatmapContainer);
          resolve(null);
          return;
        }

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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
              console.error("Heatmap canvas has zero width or height");
              offScreenContainerRef.current?.removeChild(heatmapContainer);
              resolve(null);
              return;
            }
            ctx.drawImage(heatmapCanvas, 0, 20);

            // ... (color bar and label drawing code remains the same)

            offScreenContainerRef.current?.removeChild(heatmapContainer);
            resolve(canvas.toDataURL());
          } else {
            console.error("Heatmap canvas not found");
            offScreenContainerRef.current?.removeChild(heatmapContainer);
            resolve(null);
          }
        };
        backgroundImage.src = image;
      });
    },
    [dimensions, generateHeatmapData, image],
  );

  const generateAllHeatmaps = useCallback(async () => {
    const newHeatmaps: { [key: string]: string | null } = {};
    for (const metric of selectedMetrics) {
      if (metric === "signalStrength") {
        newHeatmaps[metric] = await renderHeatmap(metric);
      } else {
        for (const testType of selectedProperties) {
          newHeatmaps[`${metric}-${testType}`] = await renderHeatmap(
            metric,
            testType,
          );
        }
      }
    }
    setHeatmaps(newHeatmaps);
  }, [renderHeatmap, selectedMetrics, selectedProperties]);

  const openHeatmapModal = (src: string, alt: string) => {
    setSelectedHeatmap({ src, alt });
  };

  const closeHeatmapModal = () => {
    setSelectedHeatmap(null);
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

  const toggleMetric = (metric: MetricType) => {
    setSelectedMetrics((prev) => {
      const newMetrics = prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric];
      return newMetrics.sort(
        (a, b) => metricTypes.indexOf(a) - metricTypes.indexOf(b),
      );
    });
  };

  const toggleProperty = (property: keyof IperfTest) => {
    setSelectedProperties((prev) => {
      const newProperties = prev.includes(property)
        ? prev.filter((p) => p !== property)
        : [...prev, property];
      return newProperties.sort(
        (a, b) => testProperties.indexOf(a) - testProperties.indexOf(b),
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
                      {metricTypes.map((metric) => (
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
          {testProperties.map((property) => (
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
                  <img
                    src={heatmaps[metric]}
                    alt={`Heatmap for ${metricTitles[metric]}`}
                    className="w-full rounded-md shadow-sm cursor-pointer transition-transform hover:scale-105"
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
                {selectedProperties.map((testType) => (
                  <div key={`${metric}-${testType}`}>
                    <h4 className="text-sm font-medium mb-2 text-gray-600">
                      {propertyTitles[testType]}
                    </h4>
                    {heatmaps[`${metric}-${testType}`] && (
                      <img
                        src={heatmaps[`${metric}-${testType}`]!}
                        alt={`Heatmap for ${metricTitles[metric]} - ${propertyTitles[testType]}`}
                        className="w-full rounded-md shadow-sm cursor-pointer transition-transform hover:scale-105"
                        onClick={() =>
                          openHeatmapModal(
                            heatmaps[`${metric}-${testType}`]!,
                            `Heatmap for ${metricTitles[metric]} - ${propertyTitles[testType]}`,
                          )
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={selectedHeatmap !== null} onOpenChange={closeHeatmapModal}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{selectedHeatmap?.alt}</DialogTitle>
          </DialogHeader>
          {selectedHeatmap && (
            <img
              src={selectedHeatmap.src}
              alt={selectedHeatmap.alt}
              className="w-full h-auto"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
