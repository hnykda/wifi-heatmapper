import React, { useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download } from "lucide-react";
import downloadImage from "@/lib/downloadImage";

type HeatmapModalProps = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

export function HeatmapModal({ src, alt, open, onClose }: HeatmapModalProps) {
  const handleDownload = useCallback(() => {
    const filename = `${alt.replace(/\s+/g, "_")}.png`;
    downloadImage(src, filename);
  }, [alt, src]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl" aria-describedby="heatmap-modal">
        <DialogHeader>
          <DialogTitle>{alt}</DialogTitle>
        </DialogHeader>
        <div className="relative min-h-[200px] flex items-center justify-center">
          {src ? (
            <>
              <img src={src} alt={alt} className="w-full h-auto" />
              <div
                className="absolute -top-[3rem] right-3 p-2 bg-gray-800 bg-opacity-50 rounded-full cursor-pointer transition-opacity hover:bg-opacity-75"
                onClick={handleDownload}
              >
                <Download className="h-6 w-6 text-white" />
              </div>
            </>
          ) : (
            <span className="text-gray-500 text-center w-full">
              No source image provided.
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default HeatmapModal;
