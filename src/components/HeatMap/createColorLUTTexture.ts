import { mapValueToColor } from "@/lib/colorLookup";
import _ from "lodash";

/**
 * Generates a 1D color lookup table (LUT) texture in WebGL.
 *
 * The LUT maps normalized scalar values [0, 1] to RGB colors using the provided `mapValueToColor` function.
 * The texture is uploaded as a 1×256 RGBA8 texture for use in fragment shaders.
 *
 * @param gl - WebGL rendering context (WebGL1-compatible)
 * @returns A WebGLTexture containing the uploaded LUT
 */
const createColorLUTTexture = (gl: WebGLRenderingContext): WebGLTexture => {
  const lutTexture = gl.createTexture();
  if (!lutTexture) {
    throw new Error("Failed to create WebGL texture.");
  }

  gl.bindTexture(gl.TEXTURE_2D, lutTexture);

  const lutResolution = 256; // Number of discrete samples in the LUT (0-255)
  const lutData = new Uint8Array(lutResolution * 4); // RGBA for each LUT entry

  // Populate the LUT with colors mapped from normalized scalar values
  _.times(lutResolution, (index) => {
    const normalized = index / (lutResolution - 1);

    let r = 0,
      g = 0,
      b = 0,
      a = 255;

    // Final LUT entry → use transparent for "no data"
    if (index === 0) {
      a = 0;
    } else {
      [r, g, b] = mapValueToColor(normalized);
    }

    const offset = index * 4; // Blocks of 4 [r,g,b,a]
    lutData.set([r, g, b, a], offset);
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // Clamp horizontally
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // Clamp vertically (though only 1px tall)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // Linear filtering for smooth interpolation
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return lutTexture;
};

export default createColorLUTTexture;
