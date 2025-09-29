// import { setDefaultTextureParams } from "../../utils/webGLDefaults";

/**
 * Generates a 1D color lookup table (LUT) texture in WebGL.
 *
 * The LUT maps normalized scalar values [0, 1] to RGB colors.
 * The texture is uploaded as a 1×256 RGBA8 texture for use in fragment shaders.
 *
 * @param gl - WebGL rendering context (WebGL1-compatible)
 * @returns A WebGLTexture containing the uploaded LUT
 */
// const createGradientLUTTexture = (
//   gl: WebGLRenderingContext,
//   gradient: { [key: string]: string },
// ): WebGLTexture => {
//   const canvas = document.createElement("canvas");
//   const ctx = canvas.getContext("2d");
//   if (!ctx) throw new Error("Failed to get canvas context.");

//   canvas.width = 256;
//   canvas.height = 1;
//   const grad = ctx.createLinearGradient(0, 0, 256, 0);
//   for (const stop in gradient) {
//     grad.addColorStop(parseFloat(stop), gradient[stop]);
//   }
//   ctx.fillStyle = grad;
//   ctx.fillRect(0, 0, 256, 1);
//   const texture = gl.createTexture();
//   gl.bindTexture(gl.TEXTURE_2D, texture);
//   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

//   setDefaultTextureParams(gl);

//   return texture;
// };

import { getColorAt } from "@/lib/utils-gradient";
import { Gradient } from "@/lib/types";

/**
 * Creates a 1D LUT texture for mapping normalized signal values [0,1] to RGBA colors.
 * @param gl - WebGLRenderingContext
 * @param gradient - Gradient stops (keys in [0,1], values as rgba string)
 * @param size - Number of samples (default: 256)
 * @returns WebGLTexture
 */
export const createGradientLUTTexture = (
  gl: WebGLRenderingContext,
  gradient: Gradient,
  size = 256,
): WebGLTexture => {
  // Allocate RGBA array
  const lutData = new Uint8Array(size * 4);

  // Fill LUT by sampling getColorAt at normalized intervals
  for (let i = 0; i < size; i++) {
    const normalized = i / (size - 1);
    const color = getColorAt(normalized, gradient); // returns {r,g,b,a}
    // console.log(`normalized and color: ${normalized} ${JSON.stringify(color)}`);
    lutData[i * 4 + 0] = color.r;
    lutData[i * 4 + 1] = color.g;
    lutData[i * 4 + 2] = color.b;
    lutData[i * 4 + 3] = Math.round(color.a * 255);
  }

  // Create WebGL texture
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create LUT texture");

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    size,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    lutData,
  );

  // Set texture parameters (no filtering; clamp to edge)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
};
