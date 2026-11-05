"use client";
import * as Slider from "@radix-ui/react-slider";
import { useSettings } from "@/components/GlobalSettings";
import { Switch } from "./ui/switch";

function LabelSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  thumbLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  thumbLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5" data-testid={id}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <label htmlFor={id}>{label}</label>
        <span className="tabular text-xs text-muted-foreground">{display}</span>
      </div>
      <Slider.Root
        id={id}
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-secondary">
          <Slider.Range className="absolute h-full rounded-full bg-brand" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-4 w-4 rounded-full border-2 border-brand bg-white shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={thumbLabel}
        />
      </Slider.Root>
    </div>
  );
}

/** The "Show readings at points" switch and how those labels look. */
export function ReadingLabelSettings() {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <h2 className="mb-1.5 text-sm font-medium">Labels</h2>
      <label className="flex items-center gap-2.5 text-sm">
        <Switch
          id="show-point-values"
          data-testid="show-point-values"
          checked={settings.showPointValues}
          onCheckedChange={(checked) =>
            updateSettings({ showPointValues: checked })
          }
        />
        Show readings at points
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        Put each measurement&apos;s value on its spot, on the colour of its dot
        on the floor plan.
      </p>
      {settings.showPointValues && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <LabelSlider
            id="point-value-scale"
            label="Text size"
            value={settings.pointValueScale}
            min={40}
            max={160}
            step={5}
            display={`${settings.pointValueScale}%`}
            thumbLabel="Reading text size"
            onChange={(pointValueScale) => updateSettings({ pointValueScale })}
          />
          <LabelSlider
            id="point-value-opacity"
            label="Background opacity"
            value={settings.pointValueOpacity}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(settings.pointValueOpacity * 100)}%`}
            thumbLabel="Reading background opacity"
            onChange={(pointValueOpacity) =>
              updateSettings({ pointValueOpacity })
            }
          />
          <label
            className="flex items-center justify-between gap-2 text-sm"
            data-testid="point-value-colour"
          >
            <span>Text colour</span>
            <input
              type="color"
              aria-label="Text colour"
              value={settings.pointValueColor}
              onChange={(event) =>
                updateSettings({ pointValueColor: event.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded-md border bg-surface p-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}
