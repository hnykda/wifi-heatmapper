"use client";
import React, { useRef, useEffect, useState, useMemo } from "react";
import { SurveyPoint, IperfTest } from "../lib/database";
import h337 from "heatmap.js";
import { MetricType } from "@/lib/heatmapGenerator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FloorplanCanvasProps {
  image: string;
  points: SurveyPoint[];
  onPointClick: (x: number, y: number) => void;
  apMapping: { apName: string; macAddress: string }[];
}

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

export default function FloorplanCanvas({
  image,
  points,
  onPointClick,
  apMapping,
}: FloorplanCanvasProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const clickableCanvasRef = useRef<HTMLCanvasElement>(null);
  const [heatmaps, setHeatmaps] = useState<{ [key: string]: string | null }>(
    {}
  );
  const [selectedHeatmap, setSelectedHeatmap] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = () => {
        setDimensions({ width: img.width, height: img.height });
        setImageLoaded(true);
        imageRef.current = img;
      };
      img.src = image;
    }
  }, [image]);

  useEffect(() => {
    if (imageLoaded) {
      drawClickableCanvas();
      // Delay heatmap generation to ensure DOM is updated
      setTimeout(() => {
        generateAllHeatmaps();
      }, 0);
    }
  }, [points, imageLoaded]);

  const drawClickableCanvas = () => {
    const canvas = clickableCanvasRef.current;
    if (canvas && imageRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageRef.current, 0, 0);

        points.forEach((point) => {
          // Draw the point
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();

          // Add text annotation
          if (point.wifiData && point.wifiData.length > 0) {
            const wifiInfo = point.wifiData[0]; // Assuming the first entry is the connected network
            const frequencyBand = wifiInfo.channel > 14 ? "5 GHz" : "2.4 GHz";
            const apLabel =
              apMapping.find((ap) => ap.macAddress === wifiInfo.bssid)
                ?.apName ?? wifiInfo.bssid;
            const annotation = `${frequencyBand}\n${apLabel}`;

            ctx.font = "12px Arial";
            ctx.fillStyle = "black";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            // Split the annotation into lines and draw each line
            const lines = annotation.split("\n");
            lines.forEach((line, index) => {
              ctx.fillText(line, point.x, point.y + 10 + index * 14); // 14 pixels line height
            });
          }
        });
      }
    }
  };

  const generateHeatmapData = useMemo(
    () => (metric: MetricType, testType?: keyof IperfTest) => {
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
        return Math.max(...point.wifiData.map((network) => network.rssi));
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

  const formatValue = (
    value: number,
    metric: MetricType,
    testType?: keyof IperfTest
  ): string => {
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
  };

  const renderHeatmap = (
    metric: MetricType,
    testType?: keyof IperfTest
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!imageLoaded || !imageRef.current) {
        console.error("Image not loaded");
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
        maxOpacity: 0.6,
        minOpacity: 0,
        blur: 0.95,
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
        canvas.width = dimensions.width + 100; // Extra width for color bar and labels
        canvas.height = dimensions.height + 40; // Extra height for top and bottom labels
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(imageRef.current!, 0, 20); // Move image down by 20px
          const heatmapCanvas = heatmapContainer.querySelector("canvas");
          if (heatmapCanvas) {
            if (heatmapCanvas.width === 0 || heatmapCanvas.height === 0) {
              console.error("Heatmap canvas has zero width or height");
              document.body.removeChild(heatmapContainer);
              resolve(null);
              return;
            }
            ctx.drawImage(heatmapCanvas, 0, 20); // Move heatmap down by 20px

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
            ctx.fillRect(colorBarX, colorBarY, colorBarWidth, colorBarHeight);

            // Add labels
            ctx.fillStyle = "black";
            ctx.font = "12px Arial";
            ctx.textAlign = "left";
            const maxLabel = formatValue(max, metric, testType);
            const minLabel = formatValue(min, metric, testType);
            ctx.fillText(maxLabel, colorBarX + colorBarWidth + 5, colorBarY);
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
            ctx.fillText(testType ? `${metric} - ${testType}` : metric, 0, 0);
            ctx.restore();
          } else {
            console.error("Heatmap canvas not found");
          }
        } else {
          console.error("Failed to get 2D context");
        }
        document.body.removeChild(heatmapContainer);
        resolve(canvas.toDataURL());
      }, 100);
    });
  };

  // ... (rest of the component code remains the same)
  const generateAllHeatmaps = async () => {
    const newHeatmaps: { [key: string]: string | null } = {};
    for (const metric of metricTypes) {
      if (metric === "signalStrength") {
        newHeatmaps[metric] = await renderHeatmap(metric);
      } else {
        for (const testType of testProperties) {
          newHeatmaps[`${metric}-${testType}`] = await renderHeatmap(
            metric,
            testType
          );
        }
      }
    }
    setHeatmaps(newHeatmaps);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onPointClick(x, y);
  };

  const openHeatmapModal = (src: string, alt: string) => {
    setSelectedHeatmap({ src, alt });
  };

  const closeHeatmapModal = () => {
    setSelectedHeatmap(null);
  };

  if (!imageLoaded) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">
          Clickable Floorplan
        </h2>
        <div className="relative">
          <canvas
            ref={clickableCanvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onClick={handleCanvasClick}
            className="border border-gray-300 rounded-lg cursor-pointer"
          />
          <div className="absolute top-2 right-2 bg-white bg-opacity-75 p-2 rounded-md text-sm">
            <p>Click to add a survey point</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Heatmaps</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {metricTypes.map((metric) => (
            <div key={metric} className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                {metric}
              </h3>
              {metric === "signalStrength" ? (
                heatmaps[metric] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heatmaps[metric]!}
                    alt={`Heatmap for ${metric}`}
                    className="w-full rounded-md shadow-sm cursor-pointer transition-transform hover:scale-105"
                    onClick={() =>
                      openHeatmapModal(
                        heatmaps[metric]!,
                        `Heatmap for ${metric}`
                      )
                    }
                  />
                )
              ) : (
                <div className="space-y-4">
                  {testProperties.map((testType) => (
                    <div key={`${metric}-${testType}`}>
                      <h4 className="text-sm font-medium mb-2 text-gray-600">
                        {testType}
                      </h4>
                      {heatmaps[`${metric}-${testType}`] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={heatmaps[`${metric}-${testType}`]!}
                          alt={`Heatmap for ${metric} - ${testType}`}
                          className="w-full rounded-md shadow-sm cursor-pointer transition-transform hover:scale-105"
                          onClick={() =>
                            openHeatmapModal(
                              heatmaps[`${metric}-${testType}`]!,
                              `Heatmap for ${metric} - ${testType}`
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
      </div>

      <Dialog open={selectedHeatmap !== null} onOpenChange={closeHeatmapModal}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{selectedHeatmap?.alt}</DialogTitle>
          </DialogHeader>
          {selectedHeatmap && (
            // eslint-disable-next-line @next/next/no-img-element
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
}
