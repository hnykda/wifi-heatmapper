"use client";
import { Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/NumberField";
import { Gradient } from "@/lib/types";
import {
  hexToRgba,
  rgbaStringToObject,
  rgbaToHex,
  gradientToCss,
} from "@/lib/utils-gradient";
import { getDefaults } from "@/components/GlobalSettings";
import { percentageToRssi } from "@/lib/utils";

type Props = {
  gradient: Gradient;
  onChange: (g: Gradient) => void;
};

/** Stops sorted by position, each as [position, rgba string]. */
export function sortedStops(gradient: Gradient): [number, string][] {
  return Object.entries(gradient)
    .map(([k, v]) => [Number(k), v] as [number, string])
    .filter(([k]) => Number.isFinite(k))
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Edit the colour stops that map signal strength (0..1) to colour.
 * The same gradient colours the survey dots and every heat map.
 */
export function GradientEditor({ gradient, onChange }: Props) {
  const stops = sortedStops(gradient);

  const replaceStop = (from: number, to: number, color: string) => {
    const next: Gradient = {};
    for (const [k, v] of stops) if (k !== from) next[k] = v;
    next[to] = color;
    onChange(next);
  };

  const removeStop = (pos: number) => {
    if (stops.length <= 2) return;
    const next: Gradient = {};
    for (const [k, v] of stops) if (k !== pos) next[k] = v;
    onChange(next);
  };

  const addStop = () => {
    // Put the new stop halfway into the widest gap
    let bestGap = 0;
    let at = 0.5;
    for (let i = 0; i < stops.length - 1; i++) {
      const gap = stops[i + 1][0] - stops[i][0];
      if (gap > bestGap) {
        bestGap = gap;
        at = Math.round(((stops[i][0] + stops[i + 1][0]) / 2) * 100) / 100;
      }
    }
    onChange({ ...gradient, [at]: "rgba(128, 128, 128, 0.6)" });
  };

  const reset = () => onChange(getDefaults("").gradient);

  return (
    <div className="space-y-3" data-testid="gradient-editor">
      <div
        className="h-5 rounded-md border"
        style={{ background: gradientToCss(gradient) }}
        aria-hidden="true"
      />
      <div className="tabular flex justify-between text-[11px] text-muted-foreground">
        <span>0% (-100 dBm)</span>
        <span>50% (-70 dBm)</span>
        <span>100% (-40 dBm)</span>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-[5.5rem_3rem_5rem_1fr_2rem] items-center gap-2 text-xs text-muted-foreground">
          <span>Position</span>
          <span>Colour</span>
          <span>Opacity</span>
          <span />
          <span />
        </div>
        {stops.map(([pos, rgba]) => {
          const { a } = rgbaStringToObject(rgba);
          const hex = rgbaToHex(rgba);
          return (
            <div
              key={pos}
              className="grid grid-cols-[5.5rem_3rem_5rem_1fr_2rem] items-center gap-2"
            >
              <NumberField
                aria-label="Stop position"
                min={0}
                max={1}
                step={0.05}
                value={pos}
                onChange={(n) => replaceStop(pos, n, rgba)}
              />
              <input
                type="color"
                aria-label="Stop colour"
                value={hex}
                onChange={(e) =>
                  replaceStop(pos, pos, hexToRgba(e.target.value, a))
                }
                className="h-9 w-12 cursor-pointer rounded-md border bg-surface p-1"
              />
              <NumberField
                aria-label="Stop opacity"
                min={0}
                max={1}
                step={0.1}
                value={a}
                onChange={(n) => replaceStop(pos, pos, hexToRgba(hex, n))}
              />
              <span className="tabular text-xs text-muted-foreground">
                {Math.round(pos * 100)}% signal, about{" "}
                {percentageToRssi(pos * 100)} dBm
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Remove stop"
                disabled={stops.length <= 2}
                onClick={() => removeStop(pos)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addStop}>
          <Plus className="h-3.5 w-3.5" />
          Add stop
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to default
        </Button>
      </div>
    </div>
  );
}
