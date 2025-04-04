import React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { getLogger } from "@/lib/logger";
// import { HeatmapConfig } from "@/lib/types";
import { useSettings } from "@/components/GlobalSettings";
import { HeatmapSettings } from "@/lib/types";
import { debounce } from "lodash";

const logger = getLogger("HeatmapAdvancedConfig");

const rgbaToHex = (rgba: string) => {
  const parts = rgba.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return "#000000";

  const r = parseInt(parts[0]);
  const g = parseInt(parts[1]);
  const b = parseInt(parts[2]);

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function HeatmapAdvancedConfig() {
  const { settings, updateSettings } = useSettings();

  logger.info(`${JSON.stringify(settings)}`);

  // const [localConfig, setLocalConfig] = useState(config);

  // function debouncedUpdateSettings(x: Partial<HeatmapSettings>) {
  //   return;
  // }
  const debouncedUpdateSettings = debounce(
    (settings: Partial<HeatmapSettings>) => updateSettings(settings),
    500,
  );
  // const handleConfigChange = (
  //   key: keyof HeatmapConfig,
  //   value: number | Record<string, string>,
  // ) => {
  //   logger.info(key, value, new Date());
  //   const newConfig = { ...localConfig, [key]: value };
  //   setLocalConfig(newConfig);
  //   debouncedSetConfig(newConfig);
  // };

  const sortedGradientEntries = () => {
    return Object.entries(settings.gradient).sort(([a], [b]) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return isNaN(numA) || isNaN(numB) ? 0 : numA - numB;
    });
  };

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="advanced-config">
        <AccordionTrigger>
          Advanced Configuration &nbsp;<i>(optional)</i>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-row gap-4">
            {/* <div>
              <Label htmlFor="radiusDivider">
                Size Adjustment
                <PopoverHelper text="Adjusts the size of the heat spots to fit the base drawing. Values are generally 1 to 10 - lower values create larger spots. Can be float." />
              </Label>
              <Input
                id="radiusDivider"
                type="number"
                step="0.1"
                value={settings.radiusDivider}
                onChange={
                  (e) =>
                    debouncedUpdateSettings({
                      radiusDivider: parseFloat(e.target.value),
                    })
                  // handleConfigChange("radius", parseFloat(e.target.value))
                }
                className="h-9"
              />
            </div> */}

            <div>
              <Label htmlFor="maxOpacity">
                Max Opacity
                <PopoverHelper text="The maximum opacity of the heatmap points. Values range from 0 to 1." />
              </Label>
              <Input
                id="maxOpacity"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={settings.maxOpacity}
                onChange={(e) =>
                  debouncedUpdateSettings({
                    maxOpacity: parseFloat(e.target.value),
                  })
                }
                className="h-9"
              />
            </div>

            <div>
              <Label htmlFor="minOpacity">
                Min Opacity
                <PopoverHelper text="The minimum opacity of the heatmap points. Values range from 0 to 1." />
              </Label>
              <Input
                id="minOpacity"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={settings.minOpacity}
                onChange={(e) =>
                  debouncedUpdateSettings({
                    minOpacity: parseFloat(e.target.value),
                  })
                }
                className="h-9"
              />
            </div>

            <div>
              <Label htmlFor="blur">
                Blur
                <PopoverHelper text="The amount of blur applied to the heatmap. Values range from 0 to 1." />
              </Label>
              <Input
                id="blur"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={settings.blur}
                onChange={(e) =>
                  debouncedUpdateSettings({ blur: parseFloat(e.target.value) })
                }
                className="h-9"
              />
            </div>
            <div>
              <Label>
                Gradient
                <PopoverHelper text="Define the color gradient for the heatmap. Each key represents a point in the gradient (0 to 1), and the value is the color. See heatmap.js gradient configuration." />
              </Label>
              <div className="flex items-center space-x-2 mt-2 mb-1 font-semibold">
                <span className="w-20 text-center">Position</span>
                <span className="w-20 text-center">Color</span>
                <span className="w-20 text-center">Opacity</span>
              </div>
              {sortedGradientEntries().map(([key, value]) => {
                const hexColor = rgbaToHex(value);
                const alpha = parseFloat(value.split(",")[3]) || 1;

                return (
                  <div key={key} className="flex items-center space-x-2 mt-2">
                    <Input
                      type="text"
                      value={key}
                      onChange={(e) => {
                        const newGradient = { ...settings.gradient };
                        delete newGradient[key];
                        newGradient[e.target.value] = value;
                        debouncedUpdateSettings({ gradient: newGradient });
                      }}
                      className="w-20 h-9"
                    />
                    <Input
                      type="color"
                      value={hexColor}
                      onChange={(e) => {
                        const newColor = hexToRgba(e.target.value, alpha);
                        const newGradient = {
                          ...settings.gradient,
                          [key]: newColor,
                        };
                        debouncedUpdateSettings({ gradient: newGradient });
                      }}
                      className="w-20 h-9"
                    />
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={alpha}
                      onChange={(e) => {
                        const newAlpha = parseFloat(e.target.value);
                        const newColor = hexToRgba(hexColor, newAlpha);
                        const newGradient = {
                          ...settings.gradient,
                          [key]: newColor,
                        };
                        debouncedUpdateSettings({ gradient: newGradient });
                      }}
                      className="w-20 h-9"
                    />
                  </div>
                );
              })}
              <button
                onClick={() => {
                  const newGradient = {
                    ...settings.gradient,
                    [""]: "rgba(0, 0, 0, 1)",
                  };
                  debouncedUpdateSettings({ gradient: newGradient });
                }}
                className="mt-2 px-2 py-1 bg-blue-500 text-white rounded"
              >
                Add Color Stop
              </button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export default HeatmapAdvancedConfig;
