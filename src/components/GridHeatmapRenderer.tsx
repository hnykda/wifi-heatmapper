import React, { useEffect, useRef } from "react";
import createColorLUTTexture from "./HeatMap/createColorLUTTexture";
import generateFragmentShader from "./HeatMap/generateFragmentShader";
import vertexShaderSource from "./HeatMap/vertexShader";
import {
  createFullScreenQuad,
  createShaderProgram,
  createWebGLContext,
  getAttribLocations,
  getUniformLocations,
} from "./HeatMap/webGLUtils";

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

// -- MAIN ENTRY POINT --

const createHeatmapWebGLRenderer = (
  canvas: HTMLCanvasElement,
  size: number,
) => {
  const gl = createWebGLContext(canvas);
  const fragmentShaderSource = generateFragmentShader(size);
  const program = createShaderProgram(
    gl,
    vertexShaderSource,
    fragmentShaderSource,
  );
  const positionBuffer = createFullScreenQuad(gl);
  const attribs = getAttribLocations(gl, program);
  const uniforms = getUniformLocations(gl, program);

  const render = (props: GridHeatmapRendererProps, colorLUT: WebGLTexture) => {
    const {
      points,
      width,
      height,
      globalOpacity = 0.5,
      influenceRadius = 100,
    } = props;

    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);

    // Flatten input points to a Float32Array of [x, y, value]
    const pointData = new Float32Array(points.length * 3);
    let maxSignal = 0;
    for (let i = 0; i < points.length; i++) {
      const { x, y, value } = points[i];
      pointData[i * 3 + 0] = x;
      pointData[i * 3 + 1] = y;
      pointData[i * 3 + 2] = value;
      if (value > maxSignal) maxSignal = value;
    }
    if (maxSignal === 0) maxSignal = 1;

    // Use program and setup buffers
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    // Set uniforms
    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_power, 2);
    gl.uniform1f(uniforms.u_opacity, globalOpacity);
    gl.uniform1f(uniforms.u_maxSignal, maxSignal);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1i(uniforms.u_pointCount, Math.min(points.length, size));
    gl.uniform3fv(uniforms.u_points, pointData);

    // Bind LUT texture to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorLUT);
    gl.uniform1i(uniforms.u_lut, 0);

    // Draw fullscreen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return { render };
};

export default createHeatmapWebGLRenderer;

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
      const visibleCanvas = canvasRef.current;
      if (!visibleCanvas) return;

      const context = visibleCanvas.getContext("2d");
      if (!context) return;

      const glCanvas = document.createElement("canvas");
      glCanvas.width = width;
      glCanvas.height = height;

      const gl = glCanvas.getContext("webgl");
      if (!gl) throw new Error("WebGL not supported");

      const colorLUT = createColorLUTTexture(gl);
      const renderer = createHeatmapWebGLRenderer(glCanvas, points.length);

      renderer.render(
        {
          points,
          influenceRadius,
          globalOpacity,
          width,
          height,
        },
        colorLUT,
      );

      const draw = () => {
        context.clearRect(0, 0, width, height);

        if (backgroundImageSrc) {
          const image = new Image();
          image.src = backgroundImageSrc;
          image.onload = () => {
            context.drawImage(image, 0, 0, width, height);
            context.drawImage(glCanvas, 0, 0); // draw WebGL result
          };
        } else {
          context.drawImage(glCanvas, 0, 0);
        }
      };

      if (!cancelled) {
        draw();
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
      style={{ width: "600px" }}
    />
  );
};
