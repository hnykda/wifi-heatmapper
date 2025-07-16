import { mapValueToColor } from "@/lib/colorLookup";
import React, { useEffect, useRef } from "react";

export interface GridHeatmapRendererProps {
  points: HeatmapPoint[];
  width: number;
  height: number;
  backgroundImageSrc?: string;
  globalOpacity?: number;
  influenceRadius?: number;
}

export type HeatmapPoint = {
  x: number;
  y: number;
  value: number;
};

export interface GridHeatmapRendererProps {
  points: HeatmapPoint[];
  width: number;
  height: number;
  backgroundImageSrc?: string;
  globalOpacity?: number;
  influenceRadius?: number;
}

const computeInterpolatedValue = (
  x: number,
  y: number,
  points: HeatmapPoint[],
  radius: number,
  power = 2,
): number => {
  const radiusSquared = radius * radius;

  let closestPointValue: number | undefined = undefined;
  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const dx = x - point.x;
    const dy = y - point.y;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared > radiusSquared) continue;

    if (distanceSquared < 1e-6) {
      closestPointValue = point.value;
      break;
    }

    const weight = 1 / Math.pow(distanceSquared, power / 2);
    weightedSum += weight * point.value;
    weightTotal += weight;
  }

  if (closestPointValue !== undefined) return closestPointValue;
  return weightTotal === 0 ? 0 : weightedSum / weightTotal;
};

const renderHeatmapGradients = async ({
  offscreenContext,
  heatmapPoints,
  influenceRadius,
  globalOpacity,
  canvasWidth,
  canvasHeight,
  chunkSize = 32,
}: {
  offscreenContext: CanvasRenderingContext2D;
  heatmapPoints: HeatmapPoint[];
  influenceRadius: number;
  globalOpacity: number;
  canvasWidth: number;
  canvasHeight: number;
  chunkSize?: number;
}): Promise<ImageData> => {
  const imageData = offscreenContext.createImageData(canvasWidth, canvasHeight);
  const data = imageData.data;
  const signalBuffer = new Float32Array(canvasWidth * canvasHeight);

  let maxSignalStrength = 0;
  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const index = y * canvasWidth + x;
      const interpolatedValue = computeInterpolatedValue(
        x,
        y,
        heatmapPoints,
        influenceRadius,
      );
      signalBuffer[index] = interpolatedValue;
      if (interpolatedValue > maxSignalStrength)
        maxSignalStrength = interpolatedValue;
    }
  }
  if (maxSignalStrength === 0) maxSignalStrength = 1;

  let yStart = 0;
  return new Promise((resolve) => {
    const renderChunk = () => {
      const yEnd = Math.min(yStart + chunkSize, canvasHeight);
      for (let y = yStart; y < yEnd; y++) {
        for (let x = 0; x < canvasWidth; x++) {
          const index = y * canvasWidth + x;
          const dataIndex = index * 4;

          let normalizedValue = signalBuffer[index] / maxSignalStrength;
          normalizedValue = Math.min(1, Math.max(0, normalizedValue));

          const [r, g, b] = mapValueToColor(normalizedValue);

          data[dataIndex] = r;
          data[dataIndex + 1] = g;
          data[dataIndex + 2] = b;
          data[dataIndex + 3] = Math.round(globalOpacity * 255);
        }
      }
      yStart = yEnd;
      if (yStart < canvasHeight) {
        requestAnimationFrame(renderChunk);
      } else {
        resolve(imageData);
      }
    };
    requestAnimationFrame(renderChunk);
  });
};

export const GridHeatmapRenderer: React.FC<GridHeatmapRendererProps> = ({
  points,
  width,
  height,
  backgroundImageSrc,
  globalOpacity = 0.5,
  influenceRadius = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      const offCanvas = document.createElement("canvas");
      offCanvas.width = width;
      offCanvas.height = height;
      const offscreenContext = offCanvas.getContext("2d");
      if (!offscreenContext) return;

      const imageData = await renderHeatmapGradients({
        offscreenContext: offscreenContext,
        heatmapPoints: points,
        influenceRadius,
        globalOpacity,
        canvasWidth: width,
        canvasHeight: height,
      });

      // Paint the heatmap buffer to the offscreen canvas
      offscreenContext.putImageData(imageData, 0, 0);

      // Clear the visible canvas before drawing new frame
      context.clearRect(0, 0, width, height);

      if (backgroundImageSrc) {
        const image = new Image();
        image.src = backgroundImageSrc;

        // Once the background image loads, draw it first and then the heatmap
        image.onload = () => {
          context.drawImage(image, 0, 0, width, height);
          context.drawImage(offscreenContext.canvas, 0, 0);
        };
      } else {
        // No background image—just draw the heatmap
        context.drawImage(offscreenContext.canvas, 0, 0);
      }

      if (!cancelled) {
        context.putImageData(imageData, 0, 0);
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [
    points,
    width,
    height,
    backgroundImageSrc,
    globalOpacity,
    influenceRadius,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: "400px" }}
    />
  );
};
