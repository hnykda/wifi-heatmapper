import * as Slider from "@radix-ui/react-slider";
import React from "react";

interface HeatmapSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export function HeatmapSlider({ value, onChange }: HeatmapSliderProps) {
  // const [value, setValue] = useState([50]);

  return (
    <div className="w-64">
      <label className="block mb-2 text-sm font-medium text-gray-700">
        Radius: {[value]}
      </label>
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        min={0}
        max={500}
        step={10}
        value={[value]}
        onValueChange={(val) => onChange(val[0])}
      >
        <Slider.Track className="bg-gray-200 relative grow rounded-full h-2">
          <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block w-4 h-4 bg-white border border-gray-300 rounded-full shadow hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Volume"
        />
      </Slider.Root>
    </div>
  );
}
