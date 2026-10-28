"use client";
import React from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

import type { ZoomPan } from "@/hooks/useZoomPan";
import { MAX_ZOOM, MIN_ZOOM, formatZoom } from "@/lib/zoom-pan";
import { cn } from "@/lib/utils";

/**
 * A frame that shows an image fitted to the space available, with zoom and
 * pan (state and gestures in useZoomPan). `children` are drawn inside the
 * frame and clipped to it; `overlay` sits over the frame unclipped (popups),
 * and the zoom controls sit in its top-right corner.
 */
export function ZoomPanViewport({
  zp,
  label,
  testId,
  className,
  children,
  overlay,
}: {
  zp: ZoomPan;
  /** What the frame shows, for screen readers */
  label: string;
  testId?: string;
  className?: string;
  children: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const { frame, ready, setOuter, setFrame } = zp;
  return (
    <div ref={setOuter} className="w-full">
      <div
        className={cn("relative mx-auto", !ready && "hidden")}
        style={{ width: frame.width }}
      >
        <div
          ref={setFrame}
          role="group"
          aria-label={`${label}. Plus and minus zoom, 0 fits, arrow keys pan.`}
          aria-roledescription="zoomable image"
          tabIndex={0}
          data-testid={testId}
          data-zoom={zp.zoom.toFixed(3)}
          data-center={`${zp.view.cx.toFixed(1)},${zp.view.cy.toFixed(1)}`}
          onPointerDown={zp.onPointerDown}
          onPointerMove={zp.onPointerMove}
          onPointerUp={zp.onPointerEnd}
          onPointerCancel={zp.onPointerEnd}
          onClickCapture={zp.onClickCapture}
          onKeyDown={zp.onKeyDown}
          className={cn(
            "relative touch-none select-none overflow-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            zp.dragging && "cursor-grabbing",
            className,
          )}
          style={{ width: frame.width, height: frame.height }}
        >
          {children}
        </div>
        {overlay}
        <ZoomControls zp={zp} />
      </div>
    </div>
  );
}

/** Zoom out, the current zoom, zoom in, fit. */
export function ZoomControls({ zp }: { zp: ZoomPan }) {
  const button =
    "flex h-7 w-7 items-center justify-center rounded text-foreground hover:bg-accent hover:text-brand disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border bg-popover/95 p-0.5 text-popover-foreground shadow-float"
      data-testid="zoom-controls"
    >
      <button
        type="button"
        className={button}
        onClick={zp.zoomOut}
        disabled={zp.zoom <= MIN_ZOOM}
        aria-label="Zoom out"
        title="Zoom out (-)"
        data-testid="zoom-out"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span
        className="min-w-11 text-center text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
        aria-label={`Zoom ${formatZoom(zp.zoom)}`}
        data-testid="zoom-level"
      >
        {formatZoom(zp.zoom)}
      </span>
      <button
        type="button"
        className={button}
        onClick={zp.zoomIn}
        disabled={zp.zoom >= MAX_ZOOM}
        aria-label="Zoom in"
        title="Zoom in (+)"
        data-testid="zoom-in"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={button}
        onClick={zp.reset}
        disabled={zp.zoom <= MIN_ZOOM}
        aria-label="Fit to view"
        title="Fit to view (0)"
        data-testid="zoom-fit"
      >
        <Maximize className="h-4 w-4" />
      </button>
    </div>
  );
}

export default ZoomPanViewport;
