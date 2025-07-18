import { RGBColor } from "@/app/webGL/shaders/gpuGradientShaderPipeline";
import { setDefaultTextureParams } from "@/app/webGL/webGLDefaults";

import _ from "lodash";

/**
 * Generates a 1D color lookup table (LUT) texture in WebGL.
 *
 * The LUT maps normalized scalar values [0, 1] to RGB colors.
 * The texture is uploaded as a 1×256 RGBA8 texture for use in fragment shaders.
 *
 * @param gl - WebGL rendering context (WebGL1-compatible)
 * @returns A WebGLTexture containing the uploaded LUT
 */
const createColorLUTTexture = (
  gl: WebGLRenderingContext,
  rgbMap: RGBColor[],
): WebGLTexture => {
  const lutTexture = gl.createTexture();
  if (!lutTexture) throw new Error("Failed to create WebGL texture");

  gl.bindTexture(gl.TEXTURE_2D, lutTexture);

  const lutResolution = 256; // Number of discrete samples in the LUT (0-255)
  const lutData = new Uint8Array(lutResolution * 4); // RGBA for each LUT entry

  // Populate the LUT with colors mapped from normalized scalar values
  _.times(lutResolution, (index) => {
    const [r, g, b] = rgbMap[index];

    const offset = index * 4;
    lutData.set([r, g, b, 255], offset);
  });

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

export default createColorLUTTexture;
