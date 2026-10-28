import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  clampView,
  fitScale,
  fitView,
  formatZoom,
  frameSize,
  frameToImage,
  imageToFrame,
  panBy,
  stepZoom,
  viewTransform,
  wheelZoomFactor,
  zoomAt,
} from "../src/lib/zoom-pan";

const image = { width: 800, height: 500 };

describe("fit", () => {
  it("fits the width when the height has room", () => {
    expect(fitScale(image, { width: 400, height: 1000 })).toBe(0.5);
  });

  it("fits the height for a tall image", () => {
    const tall = { width: 500, height: 2000 };
    const fit = fitScale(tall, { width: 1000, height: 800 });
    expect(fit).toBe(0.4);
    expect(frameSize(tall, fit)).toEqual({ width: 200, height: 800 });
  });

  it("enlarges a small image to the space", () => {
    expect(
      fitScale({ width: 100, height: 50 }, { width: 400, height: 400 }),
    ).toBe(4);
  });

  it("never returns 0 or NaN", () => {
    expect(fitScale(image, { width: 0, height: 500 })).toBe(1);
    expect(fitScale({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(
      1,
    );
  });
});

describe("clamping", () => {
  it("pins the centre at fit", () => {
    expect(clampView({ zoom: 1, cx: 10, cy: 900 }, image)).toEqual(
      fitView(image),
    );
  });

  it("keeps the frame inside the image when zoomed", () => {
    // at 2x the frame shows 400 x 250 image px
    expect(clampView({ zoom: 2, cx: 0, cy: 0 }, image)).toEqual({
      zoom: 2,
      cx: 200,
      cy: 125,
    });
    expect(clampView({ zoom: 2, cx: 9999, cy: 9999 }, image)).toEqual({
      zoom: 2,
      cx: 600,
      cy: 375,
    });
  });

  it("keeps the zoom between fit and the maximum", () => {
    expect(clampView({ zoom: 0.2, cx: 0, cy: 0 }, image).zoom).toBe(1);
    expect(clampView({ zoom: 100, cx: 400, cy: 250 }, image).zoom).toBe(
      MAX_ZOOM,
    );
    expect(clampView({ zoom: NaN, cx: NaN, cy: 1 }, image)).toEqual(
      fitView(image),
    );
  });
});

describe("coordinates", () => {
  const fit = 1.5;
  const frame = frameSize(image, fit); // 1200 x 750

  it("maps the frame to the image and back at fit", () => {
    const v = fitView(image);
    expect(frameToImage(v, frame, fit, { x: 600, y: 375 })).toEqual({
      x: 400,
      y: 250,
    });
    expect(frameToImage(v, frame, fit, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(imageToFrame(v, frame, fit, { x: 800, y: 500 })).toEqual({
      x: 1200,
      y: 750,
    });
  });

  it("maps a zoomed and panned view", () => {
    const v = { zoom: 2, cx: 300, cy: 200 };
    const { scale, offsetX, offsetY } = viewTransform(v, frame, fit);
    expect(scale).toBe(3);
    expect(offsetX).toBe(600 - 900);
    expect(offsetY).toBe(375 - 600);
    const p = { x: 123, y: 456 };
    const back = frameToImage(v, frame, fit, imageToFrame(v, frame, fit, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe("zoom at a point", () => {
  const fit = 1;
  const frame = frameSize(image, fit);

  it("keeps the image point under the cursor", () => {
    const anchor = { x: 200, y: 100 };
    const before = frameToImage(fitView(image), frame, fit, anchor);
    const v = zoomAt(fitView(image), 2, image, frame, fit, anchor);
    expect(v.zoom).toBe(2);
    const after = frameToImage(v, frame, fit, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zooms at the centre without an anchor", () => {
    expect(zoomAt(fitView(image), 3, image, frame, fit)).toEqual({
      zoom: 3,
      cx: 400,
      cy: 250,
    });
  });

  it("clamps near an edge instead of showing past the image", () => {
    const v = zoomAt(fitView(image), 2, image, frame, fit, { x: 0, y: 0 });
    expect(v).toEqual({ zoom: 2, cx: 200, cy: 125 });
    expect(frameToImage(v, frame, fit, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("zooming out to fit recentres", () => {
    const v = zoomAt({ zoom: 4, cx: 100, cy: 100 }, 1, image, frame, fit, {
      x: 5,
      y: 5,
    });
    expect(v).toEqual(fitView(image));
  });
});

describe("panning", () => {
  it("moves the image with the drag, in screen px", () => {
    const v = panBy({ zoom: 2, cx: 400, cy: 250 }, 100, -50, image, 0.5);
    // scale 1: 100 px right shows what is 100 image px to the left
    expect(v).toEqual({ zoom: 2, cx: 300, cy: 300 });
  });

  it("does nothing at fit", () => {
    expect(panBy(fitView(image), 300, 300, image, 1)).toEqual(fitView(image));
  });
});

describe("steps and wheel", () => {
  it("steps through the zoom levels", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, 1)).toBe(2);
    expect(stepZoom(1.7, 1)).toBe(2);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(1.7, -1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(1);
  });

  it("caps a wheel notch and treats pinch deltas smoothly", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(Math.exp(0.25));
    expect(wheelZoomFactor(100)).toBeCloseTo(Math.exp(-0.25));
    expect(wheelZoomFactor(-3)).toBeCloseTo(Math.exp(0.03));
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(Math.exp(0.25)); // lines
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it("formats the zoom", () => {
    expect(formatZoom(1)).toBe("100%");
    expect(formatZoom(1.5)).toBe("150%");
    expect(formatZoom(2.345)).toBe("235%");
  });
});
