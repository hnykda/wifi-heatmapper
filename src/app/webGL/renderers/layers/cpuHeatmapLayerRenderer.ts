import type { Gradient, HeatmapRange } from "@/lib/types";
import { createHeatmapInterpolator } from "../../../../lib/heatmap-interpolation";
import type { HeatmapPoint } from "../mainRenderer";
import { createGradientLUTData } from "../textures/createGradientLUTTexture";
import { drawTextureFullScreen } from "../helpers/drawFullScreenTexture";
import { setDefaultTextureParams } from "../../utils/webGLDefaults";

export function createCPUHeatmapLayerRenderer(
  gl: WebGLRenderingContext,
  points: HeatmapPoint[],
  gradient: Gradient,
) {
  const lut = createGradientLUTData(gradient);
  let texture: WebGLTexture | null = null;
  const draw = (options: {
    width: number;
    height: number;
    influenceRadius: number;
    minOpacity: number;
    maxOpacity: number;
    valueRange: HeatmapRange;
  }) => {
    const {
      width,
      height,
      influenceRadius,
      minOpacity,
      maxOpacity,
      valueRange,
    } = options;
    const interpolate = createHeatmapInterpolator(points, valueRange);
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = interpolate(x + 0.5, y + 0.5, influenceRadius);
        if (value === null) continue;
        // Match LINEAR + CLAMP_TO_EDGE on the GPU's 256-texel LUT, including
        // its half-texel offset and RGBA8 quantization. LUT alpha is not used.
        const position = Math.max(0, Math.min(255, value * 256 - 0.5));
        const lower = Math.floor(position);
        const upper = Math.min(255, lower + 1);
        const fraction = position - lower;
        // Typed-array uploads are bottom-up. Explicitly reverse rows rather
        // than inheriting UNPACK_FLIP_Y_WEBGL from the background image loader.
        const offset = ((height - 1 - y) * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          pixels[offset + c] = Math.round(
            lut[lower * 4 + c] * (1 - fraction) + lut[upper * 4 + c] * fraction,
          );
        }
        pixels[offset + 3] = Math.round(
          (minOpacity + (maxOpacity - minOpacity) * value) * 255,
        );
      }
    }
    texture ??= gl.createTexture();
    if (!texture) throw new Error("Failed to create CPU heatmap texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    setDefaultTextureParams(gl);
    drawTextureFullScreen(gl, texture);
  };
  return { draw };
}
