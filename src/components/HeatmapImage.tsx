import { Download } from "lucide-react";
import downloadImage from "@/lib/downloadImage";
import { useState } from "react";

const HeatmapImage: React.FC<{
  src: string;
  alt: string;
  onClick: () => void;
}> = ({ src, alt, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src={src}
        alt={alt}
        className="w-full rounded-md shadow-sm cursor-pointer transition-transform hover:scale-105"
        onClick={onClick}
      />
      {isHovered && (
        <div
          className="absolute top-2 right-2 p-2 bg-gray-800 bg-opacity-50 rounded-full cursor-pointer transition-opacity hover:bg-opacity-75"
          onClick={(e) => {
            e.stopPropagation();
            downloadImage(src, `${alt.replace(/\s+/g, "_")}.png`);
          }}
        >
          <Download className="h-5 w-5 text-white" />
        </div>
      )}
    </div>
  );
};

export default HeatmapImage;
