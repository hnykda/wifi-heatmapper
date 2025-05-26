import React from "react";
import { PopoverHelper } from "@/components/PopoverHelpText";
import * as Slider from "@radix-ui/react-slider";

interface HeatmapSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export function HeatmapSlider({ value, onChange }: HeatmapSliderProps) {
  return (
    <div className="w-64">
      <label className="block mb-2 text-base font-medium text-gray-700">
        Radius: {[value]} &nbsp;
        <PopoverHelper text="Changes the 'size' of each heat measurement. Drag to zero to reset to automatically calculated value. Ranges from 0 to 500." />
      </label>

      <Slider.Root
        className="relative flex items-center h-3 select-none touch-none w-full"
        min={0}
        max={500}
        step={10}
        value={[value]}
        onValueChange={(val) => onChange(val[0])}
      >
        <Slider.Track className=" relative grow rounded-full h-2 bg-gray-200">
          <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block w-5 h-5 bg-white border border-gray-300 rounded-full shadow hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Radius of each heat spot"
        />
      </Slider.Root>
    </div>
  );
}
