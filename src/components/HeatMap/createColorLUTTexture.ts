import { mapValueToColor } from "@/lib/colorLookup";

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
  for (let index = 0; index < lutResolution; index++) {
    const normalized = index / (lutResolution - 1);

    let r: number, g: number, b: number;
    let a = 255;

    if (index === 0) {
      // Final LUT entry → use transparent black for "no data"
      r = 0;
      g = 0;
      b = 0;
      a = 0;
    } else {
      [r, g, b] = mapValueToColor(normalized);
    }

    const offset = index * 4;
    lutData[offset + 0] = r;
    lutData[offset + 1] = g;
    lutData[offset + 2] = b;
    lutData[offset + 3] = a;
  }

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

  // 🔍 DEBUG: render LUT and download PNG
  // {
  //   const width = lutResolution;
  //   const height = 20;
  //   const canvas = document.createElement("canvas");
  //   canvas.width = width;
  //   canvas.height = height;
  //   const ctx = canvas.getContext("2d");
  //   if (ctx) {
  //     const imageData = ctx.createImageData(width, height);
  //     for (let x = 0; x < width; x++) {
  //       const srcOffset = x * 4;
  //       for (let y = 0; y < height; y++) {
  //         const dstOffset = (y * width + x) * 4;
  //         imageData.data[dstOffset + 0] = lutData[srcOffset + 0];
  //         imageData.data[dstOffset + 1] = lutData[srcOffset + 1];
  //         imageData.data[dstOffset + 2] = lutData[srcOffset + 2];
  //         imageData.data[dstOffset + 3] = lutData[srcOffset + 3];
  //       }
  //     }
  //     ctx.putImageData(imageData, 0, 0);

  //     // Trigger download
  //     const link = document.createElement("a");
  //     link.download = "lut-debug.png";
  //     link.href = canvas.toDataURL("image/png");
  //     link.click();
  //   }
  // }

  return lutTexture;
};

export default createColorLUTTexture;
