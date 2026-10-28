"use client";
import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomPanViewport } from "@/components/ZoomPanViewport";
import { useZoomPan } from "@/hooks/useZoomPan";
import downloadImage from "@/lib/downloadImage";

type HeatmapModalProps = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

export function HeatmapModal({ src, alt, open, onClose }: HeatmapModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1400px)] max-w-none overflow-auto p-4 sm:p-6">
        <DialogHeader className="flex-row items-center justify-between gap-4 pr-8">
          <DialogTitle className="text-base">{alt}</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadImage(src, `${alt.replace(/[^\w]+/g, "_")}.png`)
            }
          >
            <Download className="h-3.5 w-3.5" />
            Download PNG
          </Button>
        </DialogHeader>
        {src ? (
          // a new map (or opening the dialog again) starts at fit
          <ZoomableImage key={src} src={src} alt={alt} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No image to show.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

type NaturalSize = { src: string; width: number; height: number };

/** The heat map at fit, with zoom and pan. */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [size, setSize] = useState<NaturalSize | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () =>
      setSize({ src, width: img.naturalWidth, height: img.naturalHeight });
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  const image = size?.src === src ? size : null;
  const zp = useZoomPan({
    image,
    resetKey: src,
    // the dialog is at most 92% of the window, less its title and padding
    maxHeight: (h) => Math.max(200, h * 0.92 - 110),
  });

  return (
    <ZoomPanViewport
      zp={zp}
      label={alt}
      testId="heatmap-viewport"
      className="cursor-grab rounded-md bg-white"
    >
      {image && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
          style={{
            width: image.width,
            height: image.height,
            transform: `translate(${zp.offsetX}px, ${zp.offsetY}px) scale(${zp.scale})`,
          }}
        />
      )}
    </ZoomPanViewport>
  );
}

export default HeatmapModal;
