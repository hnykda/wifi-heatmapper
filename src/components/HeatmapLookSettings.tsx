"use client";
import { Palette } from "lucide-react";
import { useSettings } from "@/components/GlobalSettings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormRow } from "./FormRow";
import { GradientEditor } from "./GradientEditor";
import { NumberField } from "./NumberField";

/**
 * The heat maps' colours and how much they cover the floor plan, in a
 * dialog opened from the Heat maps tab: the maps behind it change live.
 */
export function HeatmapLookSettings() {
  const { settings, updateSettings } = useSettings();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          data-testid="heatmap-look-open"
        >
          <Palette className="h-4 w-4" />
          Colours and opacity
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Heat map colours</DialogTitle>
          <DialogDescription>
            Green is good. The signal scale runs from 0% (no signal, -100 dBm)
            to 100% (-40 dBm). Speed maps use the same colours across their own
            range, or a fixed one set under Colour scales.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormRow label="Colour stops">
            <GradientEditor
              gradient={settings.gradient}
              onChange={(gradient) => updateSettings({ gradient })}
            />
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow
              id="maxOpacity"
              label="Opacity at strongest"
              help="How much the heat map covers the floor plan where the signal is strongest. 0 is invisible, 1 is solid."
            >
              <NumberField
                id="maxOpacity"
                min={0}
                max={1}
                step={0.1}
                value={settings.maxOpacity}
                onChange={(n) => updateSettings({ maxOpacity: n })}
              />
            </FormRow>
            <FormRow
              id="minOpacity"
              label="Opacity at weakest"
              help="Opacity where the signal is weakest."
            >
              <NumberField
                id="minOpacity"
                min={0}
                max={1}
                step={0.1}
                value={settings.minOpacity}
                onChange={(n) => updateSettings({ minOpacity: n })}
              />
            </FormRow>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
