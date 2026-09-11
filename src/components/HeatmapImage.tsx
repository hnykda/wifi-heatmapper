import { Download, Maximize2 } from "lucide-react";
import downloadImage from "@/lib/downloadImage";

/** One rendered heat map with hover actions: enlarge, download. */
const HeatmapImage: React.FC<{
  src: string;
  alt: string;
  onClick: () => void;
}> = ({ src, alt, onClick }) => {
  const file = `${alt.replace(/[^\w]+/g, "_")}.png`;
  return (
    <figure className="group relative overflow-hidden rounded-md border bg-white">
      <button
        type="button"
        onClick={onClick}
        className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Enlarge ${alt}`}
      >
        <img src={src} alt={alt} className="block w-full" />
      </button>
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-auto rounded-md bg-popover/90 p-1.5 text-foreground shadow-float hover:bg-popover"
          aria-label="Enlarge"
          title="Enlarge"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => downloadImage(src, file)}
          className="pointer-events-auto rounded-md bg-popover/90 p-1.5 text-foreground shadow-float hover:bg-popover"
          aria-label="Download PNG"
          title="Download PNG"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </figure>
  );
};

export default HeatmapImage;
