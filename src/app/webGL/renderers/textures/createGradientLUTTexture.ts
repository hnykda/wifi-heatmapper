import { getColorAt } from "../../../../lib/utils-gradient";
import { Gradient } from "@/lib/types";

/** Shared RGBA8 LUT for GPU sampling and CPU LINEAR-filter emulation. */
export const createGradientLUTData = (gradient: Gradient, size = 256) => {
  // Allocate RGBA array
  const lutData = new Uint8Array(size * 4);

  // Fill LUT by sampling getColorAt at normalized intervals
  for (let i = 0; i < size; i++) {
    const normalized = i / (size - 1);
    const color = getColorAt(normalized, gradient); // returns {r,g,b,a}

    lutData[i * 4 + 0] = color.r;
    lutData[i * 4 + 1] = color.g;
    lutData[i * 4 + 2] = color.b;
    lutData[i * 4 + 3] = Math.round(color.a * 255);
  }

  return lutData;
};

export const createGradientLUTTexture = (
  gl: WebGLRenderingContext,
  gradient: Gradient,
  size = 256,
): WebGLTexture => {
  const lutData = createGradientLUTData(gradient, size);
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

  // Linear filtering, no mipmaps; clamp to edge.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
};
