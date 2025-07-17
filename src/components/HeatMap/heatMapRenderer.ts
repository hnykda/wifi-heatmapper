import { HeatmapPoint } from "../GridHeatmapRenderer";
import createColorLUTTexture from "./createColorLUTTexture";
import generateFragmentShader from "./generateFragmentShader";
import vertexShaderSource from "./vertexShader";
import {
  createShaderProgram,
  createFullScreenQuad,
  getAttribLocations,
  getUniformLocations,
} from "./webGLUtils";

export const createHeatmapRenderer = (
  gl: WebGLRenderingContext,
  points: HeatmapPoint[],
) => {
  const program = createShaderProgram(
    gl,
    vertexShaderSource,
    generateFragmentShader(points.length),
  );
  const positionBuffer = createFullScreenQuad(gl);
  const attribs = getAttribLocations(gl, program);
  const uniforms = getUniformLocations(gl, program);
  const colorLUT = createColorLUTTexture(gl);

  const maxSignal = points.reduce((max, pt) => Math.max(max, pt.value), 0);

  const flatData = Float32Array.from(
    points.flatMap(({ x, y, value }) => [x, y, value]),
  );
  console.log("work");

  const draw = (options: {
    width: number;
    height: number;
    globalOpacity: number;
    influenceRadius: number;
  }) => {
    if (!points.length) return;

    const { width, height, globalOpacity, influenceRadius } = options;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_power, 3);
    gl.uniform1f(uniforms.u_opacity, globalOpacity);
    gl.uniform1f(uniforms.u_maxSignal, maxSignal);
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
