import React, { useRef, useEffect, useState } from "react";
import { SurveyPoint } from "../lib/database";
import { Loader } from "./Loader";

interface ClickableFloorplanProps {
  image: string;
  points: SurveyPoint[];
  dimensions: { width: number; height: number };
  setDimensions: (dimensions: { width: number; height: number }) => void;
  onPointClick: (x: number, y: number) => void;
  apMapping: { apName: string; macAddress: string }[];
  status: string;
}

export const ClickableFloorplan: React.FC<ClickableFloorplanProps> = ({
  image,
  points,
  onPointClick,
  dimensions,
  setDimensions,
  apMapping,
  status,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<SurveyPoint | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

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
      drawCanvas();
    }
  }, [points, imageLoaded]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && imageRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageRef.current, 0, 0);

        points.forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();

          if (point.wifiData) {
            const wifiInfo = point.wifiData;
            const frequencyBand = wifiInfo.channel > 14 ? "5 GHz" : "2.4 GHz";
            const apLabel =
              apMapping.find((ap) => ap.macAddress === wifiInfo.bssid)
                ?.apName ?? wifiInfo.bssid;
            const annotation = `${frequencyBand}\n${apLabel}`;

            ctx.font = "12px Arial";
            ctx.fillStyle = "black";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            const lines = annotation.split("\n");
            lines.forEach((line, index) => {
              ctx.fillText(line, point.x, point.y + 10 + index * 14);
            });
          }
        });
      }
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onPointClick(x, y);
  };

  const handleCanvasMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const hoveredPoint = points.find(
      (point) => Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2) < 10,
    );

    if (hoveredPoint) {
      setHoveredPoint(hoveredPoint);
      setTooltipPosition({ x: hoveredPoint.x, y: hoveredPoint.y });
    } else {
      setHoveredPoint(null);
    }
  };

  if (!imageLoaded) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        Loading...
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold text-gray-800">
        Interactive Floorplan
      </h2>
      <div className="p-2 rounded-md text-sm">
        <p>Click on the plan to start a new measurement</p>
        <p>Hover over existing points to see the measurements details</p>
      </div>
      <div className="relative">
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg ${
            status === "running" ? "" : "hidden"
          }`}
        >
          <div className="flex flex-col items-center">
            <Loader className="w-24 h-24 text-blue-500" />
            <p className="text-white text-lg font-medium">Running...</p>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          className="border border-gray-300 rounded-lg cursor-pointer"
        />
        {hoveredPoint && (
          <div
            className="absolute bg-white border border-gray-300 p-2 rounded-md shadow-md text-sm"
            style={{
              left: tooltipPosition.x + 10,
              top: tooltipPosition.y + 10,
              zIndex: 1000,
            }}
          >
            <h3 className="font-bold">Survey Point Data</h3>
            <p>
              X: {hoveredPoint.x}, Y: {hoveredPoint.y}
            </p>
            {hoveredPoint.wifiData && (
              <>
                <p>Created: {hoveredPoint.timestamp.toLocaleString()}</p>
                <p>SSID: {hoveredPoint.wifiData.ssid}</p>
                <p>RSSI: {hoveredPoint.wifiData.rssi} dBm</p>
                <p>Channel: {hoveredPoint.wifiData.channel}</p>
                <p>BSSID: {hoveredPoint.wifiData.bssid}</p>
                <p>Frequency: {hoveredPoint.wifiData.frequency} MHz</p>
              </>
            )}
            {hoveredPoint.iperfResults && (
              <>
                <p>
                  TCP Download:{" "}
                  {formatValue(
                    hoveredPoint.iperfResults.tcpDownload.bitsPerSecond,
                    "tcpDownload",
                    "bitsPerSecond",
                  )}
                </p>
                <p>
                  TCP Upload:{" "}
                  {formatValue(
                    hoveredPoint.iperfResults.tcpUpload.bitsPerSecond,
                    "tcpUpload",
                    "bitsPerSecond",
                  )}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function formatValue(value: number, metric: string, testType: string): string {
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
