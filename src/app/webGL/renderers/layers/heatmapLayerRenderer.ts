import { Gradient } from "@/lib/types";
import { HeatmapPoint, HeatmapValueRange } from "../mainRenderer";
import generateFragmentShader from "../../shaders/heatmapFragmentShader";
import {
  createShaderProgram,
  createFullScreenQuad,
  getAttribLocations,
  getUniformLocations,
} from "../../utils/webGLUtils";
import { fullscreenQuadVertexShaderFlipY } from "@/app/webGL/shaders/fullscreenQuadVertexShader";

import { createGradientLUTTexture } from "../textures/createGradientLUTTexture";

export const createHeatmapLayerRenderer = (
  gl: WebGLRenderingContext,
  points: HeatmapPoint[],
  gradient: Gradient,
) => {
  const program = createShaderProgram(
    gl,
    fullscreenQuadVertexShaderFlipY,
    generateFragmentShader(points.length),
  );
  const positionBuffer = createFullScreenQuad(gl);
  const attribs = getAttribLocations(gl, program);
  const uniforms = getUniformLocations(gl, program);

  const colorLUT = createGradientLUTTexture(gl, gradient);
  const autoRange = {
    min: 0,
    max: points.reduce((max, { value }) => Math.max(max, value), 0) || 1e-6,
  };

  const draw = (options: {
    width: number;
    height: number;
    influenceRadius: number;
    minOpacity: number;
    maxOpacity: number;
    valueRange?: HeatmapValueRange;
  }) => {
    const {
      width,
      height,
      influenceRadius,
      minOpacity,
      maxOpacity,
      valueRange = autoRange,
    } = options;
    const { min, max } = valueRange;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      throw new RangeError("Heatmap valueRange must have finite min < max");
    }
    if (!points.length) return;

    // A shared affine transform commutes with IDW interpolation. Subtract on
    // the CPU to preserve small spans at large offsets, then scale ALL values
    // (including outliers) into [-1, 1] to avoid bits/sec overflow in mediump.
    // Do not clamp samples: only the interpolated signal may be clamped.
    const span = max - min;
    const scale = points.reduce(
      (scale, { value }) => Math.max(scale, Math.abs(value - min)),
      span,
    );
    const flatData = Float32Array.from(
      points.flatMap(({ x, y, value }) => [x, y, (value - min) / scale]),
    );

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_power, 3);
    gl.uniform1f(uniforms.u_minOpacity, minOpacity);
    gl.uniform1f(uniforms.u_maxOpacity, maxOpacity);
    gl.uniform1f(uniforms.u_minSignal, 0);
    gl.uniform1f(uniforms.u_maxSignal, span / scale);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1i(uniforms.u_pointCount, Math.min(points.length, points.length));
    gl.uniform3fv(uniforms.u_points, flatData);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorLUT);
    gl.uniform1i(uniforms.u_lut, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return { draw };
};
