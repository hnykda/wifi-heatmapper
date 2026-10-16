import { useEffect, useState } from "react";
import {
  HeatmapKey,
  HeatmapRange,
  HeatmapScale,
  IperfTestProperty,
} from "@/lib/types";
import { isValidHeatmapRange } from "@/lib/heatmap-scale";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";

export function HeatmapScaleControl({
  mapKey,
  property,
  title,
  label,
  scale,
  automaticRange,
  onChange,
}: {
  mapKey: HeatmapKey;
  property: keyof IperfTestProperty;
  title: string;
  label: string;
  scale?: HeatmapScale;
  automaticRange: HeatmapRange;
  onChange: (key: HeatmapKey, scale: HeatmapScale) => void;
}) {
  const remembered = isValidHeatmapRange(scale, property);
  const fixed = remembered && scale.enabled;
  const current = remembered ? scale : automaticRange;
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
    const next = { min: Number(min), max: Number(max), enabled: true };
    if (
      !fixed ||
      !valid ||
      (next.min === current.min && next.max === current.max)
    )
      return;
    const timer = setTimeout(() => onChange(mapKey, next), 300);
    return () => clearTimeout(timer);
  }, [min, max, fixed, valid, current.min, current.max, mapKey, onChange]);
  const id = `scale-${mapKey}`;

  return (
    <div className="space-y-2" data-testid={id}>
      <label
        htmlFor={id}
        className="flex items-center justify-between gap-2 text-sm"
      >
        <span>{title}</span>
        <Switch
          id={id}
          aria-label={`Fixed scale for ${label}`}
          checked={fixed}
          onCheckedChange={(enabled) =>
            onChange(mapKey, {
              ...(fixed && valid ? draft : current),
              enabled,
            })
          }
        />
      </label>
      {fixed ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              Lower
              <Input
                aria-label={`${label} lower value`}
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
                aria-label={`${label} upper value`}
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
              Lower must be 0 or more and less than upper.
              {property === "signalStrength"
                ? " Upper must be 100 or less."
                : ""}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {property === "signalStrength"
            ? "Default: 0–100%."
            : "Automatic: 0 to this map’s maximum."}
        </p>
      )}
    </div>
  );
}
