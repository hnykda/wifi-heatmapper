import React from "react";
import * as Slider from "@radix-ui/react-slider";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { Button } from "@/components/ui/button";

interface HeatmapSliderProps {
  value: number;
  isAuto: boolean;
  onChange: (val: number) => void;
  onReset: () => void;
}

/** Radius of influence of each point, in floor plan pixels. */
export function HeatmapSlider({
  value,
  isAuto,
  onChange,
  onReset,
}: HeatmapSliderProps) {
  return (
    <div className="space-y-2" data-testid="radius-control">
      <div className="flex items-center gap-1.5">
        <label htmlFor="radius" className="text-sm font-medium">
          Radius
        </label>
        <PopoverHelper text="How far each measurement reaches. Increase it until neighbouring spots merge into one surface; decrease it to see more detail. The automatic value is based on how spread out your points are." />
        <span className="tabular ml-auto text-sm text-muted-foreground">
          {value} px{isAuto ? " (auto)" : ""}
        </span>
      </div>
      <Slider.Root
        id="radius"
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={10}
        max={800}
        step={10}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-secondary">
          <Slider.Range className="absolute h-full rounded-full bg-brand" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-4 w-4 rounded-full border-2 border-brand bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Radius of each heat spot"
        />
      </Slider.Root>
      {!isAuto && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={onReset}
        >
          Back to automatic
        </Button>
      )}
    </div>
  );
}
