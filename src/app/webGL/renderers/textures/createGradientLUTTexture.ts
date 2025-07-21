import { setDefaultTextureParams } from "../../utils/webGLDefaults";

/**
 * Generates a 1D color lookup table (LUT) texture in WebGL.
 *
 * The LUT maps normalized scalar values [0, 1] to RGB colors.
 * The texture is uploaded as a 1×256 RGBA8 texture for use in fragment shaders.
 *
 * @param gl - WebGL rendering context (WebGL1-compatible)
 * @returns A WebGLTexture containing the uploaded LUT
 */
const createGradientLUTTexture = (
  gl: WebGLRenderingContext,
  gradient: { [key: string]: string },
): WebGLTexture => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context.");

  canvas.width = 256;
  canvas.height = 1;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  for (const stop in gradient) {
    grad.addColorStop(parseFloat(stop), gradient[stop]);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

  setDefaultTextureParams(gl);

  return texture;
};

export default createGradientLUTTexture;
