import { Gradient } from "@/lib/types";
import { HeatmapPoint } from "../mainRenderer";
import generateFragmentShader from "../../shaders/heatmapFragmentShader";
import {
  createShaderProgram,
  createFullScreenQuad,
  getAttribLocations,
  getUniformLocations,
} from "../../utils/webGLUtils";
import { fullscreenQuadVertexShaderFlipY } from "@/app/webGL/shaders/fullscreenQuadVertexShader";
import _ from "lodash";
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
  const fallbackMaxSignal = _.maxBy(points, "value")?.value ?? 0;
  const flatData = Float32Array.from(
    points.flatMap(({ x, y, value }) => [x, y, value]),
  );

  const draw = (options: {
    width: number;
    height: number;
    influenceRadius: number;
    minOpacity: number;
    maxOpacity: number;
    maxSignal?: number;
  }) => {
    if (!points.length) return;

    const {
      width,
      height,
      influenceRadius,
      minOpacity,
      maxOpacity,
      maxSignal,
    } = options;

    const effectiveMaxSignal =
      maxSignal !== undefined && maxSignal > 0
        ? maxSignal
        : fallbackMaxSignal || 1;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_power, 3);
    gl.uniform1f(uniforms.u_minOpacity, minOpacity);
    gl.uniform1f(uniforms.u_maxOpacity, maxOpacity);
    gl.uniform1f(uniforms.u_maxSignal, effectiveMaxSignal);
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
