import { Gradient, HeatmapRange } from "@/lib/types";
import { HeatmapPoint } from "../mainRenderer";
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
  const draw = (options: {
    width: number;
    height: number;
    influenceRadius: number;
    minOpacity: number;
    maxOpacity: number;
    valueRange: HeatmapRange;
  }) => {
    if (!points.length) return;

    const { width, height, influenceRadius, minOpacity, maxOpacity } = options;
    // Scale to 0..1 here, in double precision, so float32 on the GPU never
    // sees raw bits/second. Values outside the range are kept unclamped.
    const { min, max } = options.valueRange;
    const span = max - min;
    if (!(span > 0) || !Number.isFinite(span)) {
      throw new RangeError("Heatmap valueRange must have finite min < max");
    }
    const flatData = Float32Array.from(
      points.flatMap(({ x, y, value }) => [x, y, (value - min) / span]),
    );

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_power, 3);
    gl.uniform1f(uniforms.u_minOpacity, minOpacity);
    gl.uniform1f(uniforms.u_maxOpacity, maxOpacity);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1i(uniforms.u_pointCount, points.length);
    gl.uniform3fv(uniforms.u_points, flatData);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorLUT);
    gl.uniform1i(uniforms.u_lut, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return { draw };
};
