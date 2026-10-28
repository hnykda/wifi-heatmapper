/**
 * Zoom and pan math for an image shown in a frame (ZoomPanViewport).
 *
 * The frame is the image "fitted": the largest size that fits the space
 * available, keeping the image's aspect ratio. So at zoom 1 the image fills
 * the frame exactly, and zoom is relative to that fit (1 = 100%).
 *
 * A view is a zoom plus the image point (in image px) at the frame's centre.
 * Keeping the centre in image coordinates means a resized frame still shows
 * the same part of the image.
 */

export type Size = { width: number; height: number };
export type XY = { x: number; y: number };
export type View = { zoom: number; cx: number; cy: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** What the zoom buttons and + / - keys step through. */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8];

/** CSS px per image px for the image to fit in max (never 0). */
export function fitScale(image: Size, max: Size): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  const s = Math.min(max.width / image.width, max.height / image.height);
  return s > 0 && Number.isFinite(s) ? s : 1;
}

/** The frame: the image at fit scale, in whole CSS px. */
export function frameSize(image: Size, fit: number): Size {
  return {
    width: Math.max(1, Math.round(image.width * fit)),
    height: Math.max(1, Math.round(image.height * fit)),
  };
}

export function fitView(image: Size): View {
  return { zoom: 1, cx: image.width / 2, cy: image.height / 2 };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Keep the zoom in range and the frame inside the image: at zoom z the frame
 * shows 1/z of the image's width and height, so the centre can move at most
 * to half of that from each edge. At fit it is pinned to the middle.
 */
export function clampView(view: View, image: Size): View {
  const zoom = clampZoom(view.zoom);
  const hw = image.width / (2 * zoom);
  const hh = image.height / (2 * zoom);
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (lo + hi) / 2;
  return {
    zoom,
    cx: clamp(view.cx, hw, image.width - hw),
    cy: clamp(view.cy, hh, image.height - hh),
  };
}

/** Where the image's top-left corner is in the frame, and its scale. */
export function viewTransform(view: View, frame: Size, fit: number) {
  const scale = fit * view.zoom;
  return {
    scale,
    offsetX: frame.width / 2 - view.cx * scale,
    offsetY: frame.height / 2 - view.cy * scale,
  };
}

/** A point in the frame (CSS px from its top-left) to image px. */
export function frameToImage(view: View, frame: Size, fit: number, p: XY): XY {
  const { scale, offsetX, offsetY } = viewTransform(view, frame, fit);
  return { x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale };
}

/** An image point to the frame (CSS px from its top-left). */
export function imageToFrame(view: View, frame: Size, fit: number, p: XY): XY {
  const { scale, offsetX, offsetY } = viewTransform(view, frame, fit);
  return { x: offsetX + p.x * scale, y: offsetY + p.y * scale };
}

/**
 * Zoom to `zoom`, keeping the image point under `anchor` (frame px) where
 * it is, as far as the clamp allows. Without an anchor, the frame's centre.
 */
export function zoomAt(
  view: View,
  zoom: number,
  image: Size,
  frame: Size,
  fit: number,
  anchor: XY = { x: frame.width / 2, y: frame.height / 2 },
): View {
  const z = clampZoom(zoom);
  const under = frameToImage(view, frame, fit, anchor);
  const scale = fit * z;
  return clampView(
    {
      zoom: z,
      cx: under.x - (anchor.x - frame.width / 2) / scale,
      cy: under.y - (anchor.y - frame.height / 2) / scale,
    },
    image,
  );
}

/** Move the image by (dx, dy) CSS px, as a drag does. */
export function panBy(
  view: View,
  dx: number,
  dy: number,
  image: Size,
  fit: number,
): View {
  const scale = fit * view.zoom;
  return clampView(
    { zoom: view.zoom, cx: view.cx - dx / scale, cy: view.cy - dy / scale },
    image,
  );
}

/** The next step up (+1) or down (-1) from zoom, for the buttons. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const EPS = 1e-6;
  if (direction > 0) {
    return ZOOM_STEPS.find((s) => s > zoom + EPS) ?? MAX_ZOOM;
  }
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - EPS) ?? MIN_ZOOM;
}

/**
 * The zoom factor for one ctrl/cmd + wheel event. A trackpad pinch sends
 * many small deltas, a mouse wheel few large ones (about 100 px, or lines
 * in Firefox): each notch is capped to about 1.28x so neither jumps.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px =
    deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const capped = Math.max(-25, Math.min(25, px));
  return Math.exp(-capped * 0.01);
}

/** "150%" */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
