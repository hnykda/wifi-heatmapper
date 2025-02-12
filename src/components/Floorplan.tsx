import React, { useRef, useEffect, useState } from "react";
import { SurveyPoint } from "@/lib/types";
import { Loader } from "./Loader";
import PopupDetails from "./PopupDetails";

interface ClickableFloorplanProps {
  image: string;
  points: SurveyPoint[];
  dimensions: { width: number; height: number };
  setDimensions: (dimensions: { width: number; height: number }) => void;
  onPointClick: (x: number, y: number) => void;
  apMapping: { apName: string; macAddress: string }[];
  status: string;
  onDelete: (id: string[]) => void;
  updateDatapoint: (id: string, data: Partial<SurveyPoint>) => void;
}

export const ClickableFloorplan: React.FC<ClickableFloorplanProps> = ({
  image,
  points,
  onPointClick,
  dimensions,
  setDimensions,
  apMapping,
  status,
  onDelete,
  updateDatapoint,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<SurveyPoint | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

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
  }, [image, setDimensions]);

  useEffect(() => {
    if (imageLoaded && canvasRef.current) {
      const canvas = canvasRef.current;
      const containerWidth = containerRef.current?.clientWidth || canvas.width;
      const scaleX = containerWidth / dimensions.width;
      setScale(scaleX);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      drawCanvas();
    }
  }, [imageLoaded, dimensions]);

  // Takes a signal strength (-40 .. -80)
  // returns a rgba() giving a color gradient between red (-40) and blue (-80)
  function getGradientColor(strength: number): string {
    // Clamp strength between -80 and -40
    strength = Math.max(-80, Math.min(-40, strength));

    let r: number, g: number, b: number;

    if (strength >= -40) {
      // Red (>= -40)
      r = 255;
      g = 0;
      b = 0;
    } else if (strength >= -50) {
      // Red → Yellow (-40 to -50)
      const t = (strength + 50) / 10;
      r = 255;
      g = Math.round(255 * (1 - t));
      b = 0;
    } else if (strength >= -60) {
      // Yellow → Green (-50 to -60)
      const t = (strength + 60) / 10;
      r = Math.round(255 * t);
      g = 255;
      b = 0;
    } else if (strength >= -70) {
      // Green → Turquoise (-60 to -70)
      const t = (strength + 70) / 10;
      r = 0;
      g = 255;
      b = Math.round(255 * (1 - t));
    } else {
      // Turquoise → Blue (-70 to -80)
      const t = (strength + 80) / 10;
      r = 0;
      g = Math.round(255 * t);
      b = 255;
    }

    return `rgba(${r}, ${g}, ${b}, 0.6)`; // Always return fully opaque
  }

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && imageRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageRef.current, 0, 0);

        points.forEach((point, index) => {
          // Create a gradient for the point
          const gradient = ctx.createRadialGradient(
            point.x,
            point.y,
            0,
            point.x,
            point.y,
            8,
          );
          gradient.addColorStop(
            0,
            point.isDisabled
              ? "rgba(156, 163, 175, 0.9)"
              : "rgba(59, 130, 246, 0.9)",
          );
          gradient.addColorStop(
            1,
            point.isDisabled
              ? "rgba(75, 85, 99, 0.9)"
              : "rgba(37, 99, 235, 0.9)",
          );
          // Enhanced pulsing effect
          const pulseMaxSize = 20; // Increased from 8
          const pulseMinSize = 10; // New minimum size
          const pulseSize =
            pulseMinSize +
            ((Math.sin(Date.now() * 0.001 + index) + 1) / 2) *
              (pulseMaxSize - pulseMinSize);

          // Draw outer pulse
          ctx.beginPath();
          ctx.arc(point.x, point.y, pulseSize, 0, 2 * Math.PI);
          ctx.fillStyle = point.isDisabled
            ? `rgba(75, 85, 99, ${0.4 - ((pulseSize - pulseMinSize) / (pulseMaxSize - pulseMinSize)) * 0.3})`
            : `rgba(59, 130, 246, ${0.4 - ((pulseSize - pulseMinSize) / (pulseMaxSize - pulseMinSize)) * 0.3})`;
          ctx.fill();

          // Draw the main point
          ctx.beginPath();
          ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
          ctx.fillStyle = gradient;
          ctx.fill();

          // Draw a white border
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;
          ctx.stroke();

          if (point.wifiData) {
            const wifiInfo = point.wifiData;
            const frequencyBand = wifiInfo.channel > 14 ? "5 GHz" : "2.4 GHz";
            const apLabel =
              apMapping.find((ap) => ap.macAddress === wifiInfo.bssid)
                ?.apName ?? wifiInfo.bssid + " " + wifiInfo.rssi;
            const annotation = `${frequencyBand}\n${apLabel}`;

            ctx.font = "12px Arial";
            const lines = annotation.split("\n");
            const lineHeight = 14;
            const padding = 4;
            const boxWidth =
              Math.max(...lines.map((line) => ctx.measureText(line).width)) +
              padding * 2;
            const boxHeight = lines.length * lineHeight + padding * 2;

            // Draw shadow
            ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            // Draw bounding box with increased transparency
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillRect(
              point.x - boxWidth / 2,
              point.y + 15,
              boxWidth,
              boxHeight,
            );

            // Reset shadow for text
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Draw text
            ctx.fillStyle = "#1F2937";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            gradient.addColorStop(
              0,
              point.isDisabled
                ? "rgba(156, 163, 175, 0.9)"
                : getGradientColor(wifiInfo.rssi),
            );

            // Re-draw the main point
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = gradient;
            ctx.fill();

            lines.forEach((line, index) => {
              ctx.fillText(
                line,
                point.x,
                point.y + 15 + padding + index * lineHeight,
              );
            });
          }
        });
      }
    }
  };

  useEffect(() => {
    let animationFrameId: number;

    const animate = () => {
      drawCanvas();
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [points, dimensions, apMapping]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedPoint) {
      setSelectedPoint(null);
      return;
    }

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;

    const clickedPoint = points.find(
      (point) => Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2) < 10,
    );

    if (clickedPoint) {
      setSelectedPoint(selectedPoint == clickedPoint ? null : clickedPoint);
      setPopupPosition({
        x: clickedPoint.x * scale,
        y: clickedPoint.y * scale,
      });
    } else {
      setSelectedPoint(null);
      // if we don't round, everything breaks, as heatmap cannot handle floating point numbers
      // for coordinates
      onPointClick(Math.round(x), Math.round(y));
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
        <p>
          Click on existing points to see the measurement details. You need at
          least two active (not disabled) measurements.
        </p>
        <div className="space-y-2 flex flex-col">
          {points?.length > 0 && <div>Total Measurements: {points.length}</div>}
        </div>
      </div>
      <div className="relative" ref={containerRef}>
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
          className="border border-gray-300 rounded-lg cursor-pointer"
        />
        {selectedPoint && (
          <div
            style={{
              position: "absolute",
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              transform: "translate(10px, -50%)",
            }}
          >
            <PopupDetails
              point={selectedPoint}
              apMapping={apMapping}
              onClose={() => setSelectedPoint(null)}
              updateDatapoint={updateDatapoint}
              onDelete={(ids) => {
                onDelete(ids);
                setSelectedPoint(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
