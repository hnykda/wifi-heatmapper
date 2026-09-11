import React from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[78vh] w-auto max-w-full rounded-md bg-white"
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No image to show.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default HeatmapModal;
