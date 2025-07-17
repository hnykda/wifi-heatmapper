import { Gradient } from "@/lib/types";
import { createHeatmapRenderer } from "./heatMapRenderer";
import { createWebGLContext } from "./webGLUtils";
import { createBackgroundRenderer } from "@/app/webGL/renderers/image";

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

const createHeatmapWebGLRenderer = (
  canvas: HTMLCanvasElement,
  points: HeatmapPoint[],
  gradient: Gradient,
) => {
  const gl = createWebGLContext(canvas);
  const bgRenderer = createBackgroundRenderer(gl);
  const heatmapRenderer = createHeatmapRenderer(gl, points, gradient);

  const render = async (props: GridHeatmapRendererProps) => {
    const {
      width,
      height,
      globalOpacity = 0.5,
      influenceRadius = 100,
      backgroundImageSrc,
    } = props;

    canvas.width = width;
    canvas.height = height;

    gl.viewport(0, 0, width, height);

    if (backgroundImageSrc) {
      await bgRenderer.draw(backgroundImageSrc);
    }

    heatmapRenderer.draw({
      width,
      height,
      globalOpacity,
      influenceRadius,
    });
  };

  return { render };
};

export default createHeatmapWebGLRenderer;
