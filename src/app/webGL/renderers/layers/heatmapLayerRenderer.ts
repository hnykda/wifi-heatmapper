import { Gradient, HeatmapRange } from "@/lib/types";
import { HeatmapPoint } from "../mainRenderer";
import { prepareHeatmapGPUData } from "../../../../lib/heatmap-interpolation";
import { createCPUHeatmapLayerRenderer } from "./cpuHeatmapLayerRenderer";
import generateFragmentShader from "../../shaders/heatmapFragmentShader";
import {
  createShaderProgram,
  createFullScreenQuad,
  getAttribLocations,
  getUniformLocations,
} from "../../utils/webGLUtils";
import { fullscreenQuadVertexShaderFlipY } from "../../shaders/fullscreenQuadVertexShader";

import { createGradientLUTTexture } from "../textures/createGradientLUTTexture";

export const createHeatmapLayerRenderer = (
  gl: WebGLRenderingContext,
  points: HeatmapPoint[],
  gradient: Gradient,
) => {
  const precision = gl.getShaderPrecisionFormat(
    gl.FRAGMENT_SHADER,
    gl.HIGH_FLOAT,
  );
  const hasHighPrecision =
    !!precision &&
    precision.precision >= 23 &&
    precision.rangeMin >= 126 &&
    precision.rangeMax >= 127;
  let gpu: ReturnType<typeof createGPUResources> | undefined;
  let cpu: ReturnType<typeof createCPUHeatmapLayerRenderer> | undefined;
  function createGPUResources() {
    const program = createShaderProgram(
      gl,
      fullscreenQuadVertexShaderFlipY,
      generateFragmentShader(points.length),
    );
    const positionBuffer = createFullScreenQuad(gl);
    const attribs = getAttribLocations(gl, program);
    const uniforms = getUniformLocations(gl, program);

    const colorLUT = createGradientLUTTexture(gl, gradient);
    return { program, positionBuffer, attribs, uniforms, colorLUT };
  }

  const draw = (options: {
    width: number;
    height: number;
    influenceRadius: number;
    minOpacity: number;
    maxOpacity: number;
    valueRange: HeatmapRange;
  }) => {
    const {
      width,
      height,
      influenceRadius,
      minOpacity,
      maxOpacity,
      valueRange,
    } = options;
    const { min, max } = valueRange;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      throw new RangeError("Heatmap valueRange must have finite min < max");
    }
    if (!points.length) return;

    // mediump cannot safely represent squared pixel distances, weights, or
    // small affine spans. Even highp needs bounded geometry and value data.
    const safeGeometry = [
      width,
      height,
      influenceRadius,
      ...points.flatMap(({ x, y }) => [x, y]),
    ].every((value) => Number.isFinite(value) && Math.abs(value) <= 16384);
    const prepared =
      hasHighPrecision && safeGeometry && influenceRadius >= 0.001
        ? prepareHeatmapGPUData(points, valueRange)
        : null;
    if (!prepared) {
      cpu ??= createCPUHeatmapLayerRenderer(gl, points, gradient);
      cpu.draw(options);
      return;
    }
    gpu ??= createGPUResources();
    const { program, positionBuffer, attribs, uniforms, colorLUT } = gpu;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_power, 3);
    gl.uniform1f(uniforms.u_minOpacity, minOpacity);
    gl.uniform1f(uniforms.u_maxOpacity, maxOpacity);
    gl.uniform1f(uniforms.u_maxSignal, prepared.span);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1i(uniforms.u_pointCount, points.length);
    gl.uniform3fv(uniforms.u_points, prepared.data);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorLUT);
    gl.uniform1i(uniforms.u_lut, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return { draw };
};
