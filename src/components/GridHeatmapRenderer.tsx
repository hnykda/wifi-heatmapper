import React, { useEffect, useLayoutEffect, useRef } from "react";
import createHeatmapWebGLRenderer from "./HeatMap/createHeatmapWebGLRenderer";

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

export const GridHeatmapRenderer: React.FC<GridHeatmapRendererProps> = ({
  points,
  width,
  height,
  backgroundImageSrc,
  globalOpacity = 0.5,
  influenceRadius = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<
    typeof createHeatmapWebGLRenderer
  > | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rendererRef.current) return;

    rendererRef.current = createHeatmapWebGLRenderer(canvas, points);
  }, [points.length]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (renderer)
      renderer
        .render({
          points,
          influenceRadius,
          globalOpacity,
          backgroundImageSrc,
          width,
          height,
        })
        .then(() => {});
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
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
};
