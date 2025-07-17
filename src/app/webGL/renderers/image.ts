import { drawTextureFullScreen } from "@/components/HeatMap/drawTextureFullScreen";
import { setDefaultTextureParams } from "../webGLDefaults";

export const createTextureFromImage = (
  gl: WebGLRenderingContext,
  image: HTMLImageElement,
): WebGLTexture => {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create texture");

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Optional: flip Y if needed
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  setDefaultTextureParams(gl);

  return texture;
};

export const createTextureFromImageSrc = async (
  gl: WebGLRenderingContext,
  src: string,
): Promise<WebGLTexture> => {
  const image = new Image();
  image.crossOrigin = "anonymous"; // For loading cross-origin images
  image.src = src;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
  });

  return createTextureFromImage(gl, image);
};

export const createBackgroundRenderer = (gl: WebGLRenderingContext) => {
  let cachedTexture: WebGLTexture | null = null;
  let cachedSrc: string | null = null;

  const draw = async (src: string) => {
    if (cachedSrc !== src) {
      cachedTexture = await createTextureFromImageSrc(gl, src);
      cachedSrc = src;
    }

    if (cachedTexture) {
      drawTextureFullScreen(gl, cachedTexture);
    }
  };

  return { draw };
};
