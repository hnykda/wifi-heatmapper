import { createLookupTableFromGradient } from "@/app/webGL/shaders/createLookupTableFromGradient";
import { setDefaultTextureParams } from "@/app/webGL/utils/webGLDefaults";
import { Gradient } from "@/lib/types";

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
  gradient: Gradient,
): WebGLTexture => {
  const lutTexture = gl.createTexture();
  if (!lutTexture) throw new Error("Failed to create WebGL texture");

  gl.bindTexture(gl.TEXTURE_2D, lutTexture);

  const rgbMap = createLookupTableFromGradient(gradient);
  const lutResolution = rgbMap.length;
  const lutData = new Uint8Array(rgbMap.flat()); // RGBA for each LUT entry

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    lutResolution,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    lutData,
  );

  // Configure texture sampling parameters
  setDefaultTextureParams(gl);

  return lutTexture;
};

export default createGradientLUTTexture;
