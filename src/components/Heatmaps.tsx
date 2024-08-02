import React, { useCallback, useEffect, useMemo, useState } from "react";
import h337 from "heatmap.js";
import { SurveyPoint, IperfTest } from "../lib/database";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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
  bitsPerSecond: "Bits Per Second",
  jitterMs: "Jitter (ms)",
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
    {}
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

  const generateHeatmapData = useCallback(
    (metric: MetricType, testType?: keyof IperfTest) => {
      return points.map((point) => ({
        x: point.x,
        y: point.y,
        value: getMetricValue(point, metric, testType),
      }));
    },
    [points]
  );

  const getMetricValue = (
    point: SurveyPoint,
    metric: MetricType,
    testType?: keyof IperfTest
  ): number => {
    switch (metric) {
      case "signalStrength":
        return point.wifiData.rssi;
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
  };

  const renderHeatmap = useCallback(
    (
      metric: MetricType,
      testType?: keyof IperfTest
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        if (dimensions.width === 0 || dimensions.height === 0) {
          console.error("Image dimensions not set");
          resolve(null);
          return;
        }

        const heatmapData = generateHeatmapData(metric, testType);
        const heatmapContainer = document.createElement("div");
        heatmapContainer.style.width = `${dimensions.width}px`;
        heatmapContainer.style.height = `${dimensions.height}px`;
        heatmapContainer.style.position = "relative";

        document.body.appendChild(heatmapContainer);

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

        setTimeout(() => {
          const canvas = document.createElement("canvas");
          canvas.width = dimensions.width + 100;
          canvas.height = dimensions.height + 40;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw the background image
            const backgroundImage = new Image();
            backgroundImage.onload = () => {
              ctx.drawImage(
                backgroundImage,
                0,
                20,
                dimensions.width,
                dimensions.height
              );

              // Draw the heatmap on top of the background image
              const heatmapCanvas = heatmapContainer.querySelector("canvas");
              if (heatmapCanvas) {
                if (heatmapCanvas.width === 0 || heatmapCanvas.height === 0) {
                  console.error("Heatmap canvas has zero width or height");
                  document.body.removeChild(heatmapContainer);
                  resolve(null);
                  return;
                }
                ctx.drawImage(heatmapCanvas, 0, 20);

                // Draw color bar
                const colorBarWidth = 30;
                const colorBarHeight = dimensions.height;
                const colorBarX = dimensions.width + 20;
                const colorBarY = 20;

                const gradient = ctx.createLinearGradient(
                  0,
                  colorBarY + colorBarHeight,
                  0,
                  colorBarY
                );
                gradient.addColorStop(0, "blue");
                gradient.addColorStop(0.5, "green");
                gradient.addColorStop(1, "red");

                ctx.fillStyle = gradient;
                ctx.fillRect(
                  colorBarX,
                  colorBarY,
                  colorBarWidth,
                  colorBarHeight
                );

                // Add labels
                ctx.fillStyle = "black";
                ctx.font = "12px Arial";
                ctx.textAlign = "left";
                const maxLabel = formatValue(max, metric, testType);
                const minLabel = formatValue(min, metric, testType);
                ctx.fillText(
                  maxLabel,
                  colorBarX + colorBarWidth + 5,
                  colorBarY
                );
                ctx.fillText(
                  minLabel,
                  colorBarX + colorBarWidth + 5,
                  colorBarY + colorBarHeight + 12
                );

                // Add metric name
                ctx.save();
                ctx.translate(canvas.width - 5, canvas.height / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.textAlign = "center";
                ctx.fillText(
                  testType ? `${metric} - ${testType}` : metric,
                  0,
                  0
                );
                ctx.restore();

                document.body.removeChild(heatmapContainer);
                resolve(canvas.toDataURL());
              } else {
                console.error("Heatmap canvas not found");
                document.body.removeChild(heatmapContainer);
                resolve(null);
              }
            };
            backgroundImage.src = image;
          } else {
            console.error("Failed to get 2D context");
            document.body.removeChild(heatmapContainer);
            resolve(null);
          }
        }, 100);
      });
    },
    [dimensions, generateHeatmapData, image]
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
            testType as keyof IperfTest
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
  ]);

  const toggleMetric = (metric: MetricType) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric]
    );
  };

  const toggleProperty = (property: keyof IperfTest) => {
    setSelectedProperties((prev) =>
      prev.includes(property)
        ? prev.filter((p) => p !== property)
        : [...prev, property]
    );
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {selectedMetrics.map((metric) => (
          <div key={metric} className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium mb-3 text-gray-700">
              {metricTitles[metric]}
            </h3>
            {metric === "signalStrength" ? (
              heatmaps[metric] && (
                <img
                  src={heatmaps[metric]!}
                  alt={`Heatmap for ${metricTitles[metric]}`}
                  className="w-full rounded-md shadow-sm cursor-pointer transition-transform hover:scale-105"
                  onClick={() =>
                    openHeatmapModal(
                      heatmaps[metric]!,
                      `Heatmap for ${metricTitles[metric]}`
                    )
                  }
                />
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
                            `Heatmap for ${metricTitles[metric]} - ${propertyTitles[testType]}`
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

function formatValue(
  value: number,
  metric: MetricType,
  testType?: keyof IperfTest
): string {
  if (metric === "signalStrength") {
    return `${Math.round(value)} dBm`;
  }
  if (testType === "bitsPerSecond") {
    return `${(value / 1000000).toFixed(2)} Mbps`;
  }
  if (testType === "jitterMs") {
    return `${value.toFixed(4)} ms`;
  }
  if (
    testType === "lostPackets" ||
    testType === "retransmits" ||
    testType === "packetsReceived"
  ) {
    return Math.round(value).toString();
  }
  return value.toFixed(2);
}
