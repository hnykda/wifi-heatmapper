import { mapValueToColor } from "@/lib/colorLookup";
import _ from "lodash";
import React, { useEffect, useRef } from "react";

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

/**
 * Computes an interpolated signal value for a given (x, y) coordinate
 * based on inverse distance weighting from nearby heatmap points.
 */
const computeInterpolatedValue = (
  x: number,
  y: number,
  points: HeatmapPoint[],
  radius: number,
  power = 2,
): number => {
  let weightedSum = 0;
  let weightTotal = 0;
  const radiusSquared = radius * radius;

  for (const point of points) {
    const dx = x - point.x;
    const dy = y - point.y;
    const distanceSquared = dx * dx + dy * dy;

    // Ignore points outside the influence radius
    if (distanceSquared > radiusSquared) continue;

    // Use inverse distance weighting (with a small epsilon to avoid division by zero)
    const weight = 1 / Math.pow(distanceSquared || 1e-6, power / 2);
    weightedSum += weight * point.value;
    weightTotal += weight;
  }

  // Return weighted average, or 0 if no contributing points
  return weightTotal === 0 ? 0 : weightedSum / weightTotal;
};

/**
 * Renders the heatmap to the provided canvas contexts using per-pixel interpolation
 * and a color gradient lookup.
 */
const renderHeatmapGradients = ({
  offscreenContext,
  heatmapPoints,
  influenceRadius,
  globalOpacity,
  canvasWidth,
  canvasHeight,
}: {
  offscreenContext: CanvasRenderingContext2D;
  heatmapPoints: HeatmapPoint[];
  influenceRadius: number;
  globalOpacity: number;
  canvasWidth: number;
  canvasHeight: number;
}) => {
  // Find the highest signal value for normalization
  const maxSignalStrength = _.maxBy(heatmapPoints, "value")?.value || 1;

  // Allocate pixel buffer for drawing heatmap image
  const imageData = offscreenContext.createImageData(canvasWidth, canvasHeight);
  const data = imageData.data;

  // Iterate over every pixel in the canvas
  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const dataIndex = (y * canvasWidth + x) * 4;

      // Interpolate signal value from nearby points
      const interpolatedValue = computeInterpolatedValue(
        x,
        y,
        heatmapPoints,
        influenceRadius,
      );

      // Normalize signal to [0, 1] for color mapping
      const normalizedValue = _.clamp(
        interpolatedValue / maxSignalStrength,
        0,
        1,
      );

      // Convert normalized signal to RGB using heatmap gradient
      const [red, green, blue] = mapValueToColor(normalizedValue);

      // Write pixel RGBA to image buffer
      data[dataIndex] = red;
      data[dataIndex + 1] = green;
      data[dataIndex + 2] = blue;
      data[dataIndex + 3] = Math.round(globalOpacity * 255); // Alpha
    }
  }

  return imageData;
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offscreenContext = offCanvas.getContext("2d");
    if (!offscreenContext) return;

    const imageData = renderHeatmapGradients({
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
