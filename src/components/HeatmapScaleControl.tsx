import { useEffect, useState } from "react";
import { HeatmapRange, IperfTestProperty } from "@/lib/types";
import { defaultHeatmapRanges, isValidHeatmapRange } from "@/lib/heatmap-scale";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";

export function HeatmapScaleControl({
  property,
  title,
  range,
  onChange,
}: {
  property: keyof IperfTestProperty;
  title: string;
  range?: HeatmapRange;
  onChange: (range: HeatmapRange | undefined) => void;
}) {
  const fixed = isValidHeatmapRange(range, property);
  const current = fixed ? range : defaultHeatmapRanges[property];
  const [min, setMin] = useState(String(current.min));
  const [max, setMax] = useState(String(current.max));
  useEffect(() => {
    setMin(String(current.min));
    setMax(String(current.max));
  }, [current.min, current.max, fixed]);
  const draft = { min: Number(min), max: Number(max) };
  const valid =
    min.trim() !== "" &&
    max.trim() !== "" &&
    isValidHeatmapRange(draft, property);
  useEffect(() => {
    const next = { min: Number(min), max: Number(max) };
    if (
      !fixed ||
      !valid ||
      (next.min === current.min && next.max === current.max)
    )
      return;

    const timer = setTimeout(() => onChange(next), 30);
    return () => clearTimeout(timer);
  }, [min, max, fixed, valid, current.min, current.max, onChange]);
  const id = `scale-${property}`;

  return (
    <div className="space-y-2" data-testid={id}>
      <label
        htmlFor={id}
        className="flex items-center justify-between gap-2 text-sm"
      >
        <span>{title}</span>
        <Switch
          id={id}
          aria-label={`Fixed scale for ${title}`}
          checked={fixed}
          onCheckedChange={(checked) => onChange(checked ? current : undefined)}
        />
      </label>
      {fixed ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              Lower
              <Input
                aria-label={`${title} lower value`}
                type="number"
                min={0}
                max={property === "signalStrength" ? 100 : undefined}
                step="any"
                value={min}
                onChange={(event) => setMin(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Upper
              <Input
                aria-label={`${title} upper value`}
                type="number"
                min={0}
                max={property === "signalStrength" ? 100 : undefined}
                step="any"
                value={max}
                onChange={(event) => setMax(event.target.value)}
              />
            </label>
          </div>
          {!valid && (
            <p role="alert" className="text-xs text-muted-foreground">
              Enter finite values with 0 ≤ lower &lt; upper
              {property === "signalStrength" ? " ≤ 100" : ""}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {property === "signalStrength"
            ? "Default: 0–100%."
            : "Automatic: 0 to each map’s maximum."}
        </p>
      )}
    </div>
  );
}
