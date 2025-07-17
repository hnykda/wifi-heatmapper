import React, { useEffect, useRef } from "react";
import createColorLUTTexture from "./HeatMap/createColorLUTTexture";
import generateFragmentShader from "./HeatMap/generateFragmentShader";
import vertexShaderSource from "./HeatMap/vertexShader";
import {
  createFullScreenQuad,
  createShaderProgram,
  createTextureFromImageSrc,
  createWebGLContext,
  getAttribLocations,
  getUniformLocations,
} from "./HeatMap/webGLUtils";
import _ from "lodash";
import { drawTextureFullScreen } from "./HeatMap/drawTextureFullScreen";

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
  const colorLUT = createColorLUTTexture(gl);

  const render = async (props: GridHeatmapRendererProps) => {
    const {
      points,
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
      const bgTexture = await createTextureFromImageSrc(gl, backgroundImageSrc); // you should have a helper for this
      drawTextureFullScreen(gl, bgTexture);
    }

    // Converting structured point array into a flat Float32Array of packed vec3s [x, y, value, x, y, value, ...]
    const pointData = Float32Array.from(
      points.flatMap(({ x, y, value }) => [x, y, value]),
    );
    const maxSignal = _.maxBy(points, "value")?.value || 1;

    // Use program and setup buffers
    gl.useProgram(program); // Bind the compiled shader program
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); // Bind the full-screen quad vertex buffer
    gl.enableVertexAttribArray(attribs.a_position); // Enable the a_position attribute for vertex input
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0); // Describe buffer layout: vec2 per vertex

    // Set uniforms
    gl.uniform1f(uniforms.u_radius, influenceRadius); // Set radius of influence for signal weighting
    gl.uniform1f(uniforms.u_power, 3); // Set falloff exponent for inverse-distance weighting
    gl.uniform1f(uniforms.u_opacity, globalOpacity); // Set global alpha blending value
    gl.uniform1f(uniforms.u_maxSignal, maxSignal); // Set max signal for normalization (signal / max)
    gl.uniform2f(uniforms.u_resolution, width, height); // Pass canvas resolution for pixel-space math
    gl.uniform1i(uniforms.u_pointCount, Math.min(points.length, size)); // Pass active point count (clamped to buffer size)
    gl.uniform3fv(uniforms.u_points, pointData); // Upload flat array of [x, y, value] triplets

    // Bind LUT texture to texture unit 0
    gl.activeTexture(gl.TEXTURE0); // Select texture unit 0 (default)
    gl.bindTexture(gl.TEXTURE_2D, colorLUT); // Bind the LUT texture to current unit
    gl.uniform1i(uniforms.u_lut, 0); // Set sampler uniform to texture unit 0

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
    const glCanvas = canvasRef.current;
    if (!glCanvas) return;

    const renderer = createHeatmapWebGLRenderer(glCanvas, points.length);

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
      style={{ width: "600px" }}
    />
  );
};
