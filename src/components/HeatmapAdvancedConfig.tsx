import React, { useState } from "react";
import { debounce } from "lodash";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";

export type HeatmapConfig = {
  radiusDivider: number;
  maxOpacity: number;
  minOpacity: number;
  blur: number;
  gradient: Record<string, string>;
};

const HeatmapAdvancedConfig = ({
  config,
  setConfig,
}: {
  config: HeatmapConfig;
  setConfig: (config: HeatmapConfig) => void;
}) => {
  const [localConfig, setLocalConfig] = useState(config);

  const handleConfigChange = (
    key: keyof HeatmapConfig,
    value: number | Record<string, string>,
  ) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    setConfig(newConfig);
  };

  const debouncedOnChange = debounce(handleConfigChange, 500);

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="advanced-config">
        <AccordionTrigger>Advanced Configuration</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-row gap-4">
            <div>
              <Label htmlFor="radiusDivider">
                Radius Divider
                <PopoverHelper text="Divides the minimum of width and height to calculate the radius. Lower values create larger heat spots. Can be decimal." />
              </Label>
              <Input
                id="radiusDivider"
                type="number"
                step="0.1"
                value={localConfig.radiusDivider}
                onChange={(e) =>
                  handleConfigChange(
                    "radiusDivider",
                    parseFloat(e.target.value),
                  )
                }
                className="h-9"
              />
            </div>

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
                value={localConfig.maxOpacity}
                onChange={(e) =>
                  handleConfigChange("maxOpacity", parseFloat(e.target.value))
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
                value={localConfig.minOpacity}
                onChange={(e) =>
                  handleConfigChange("minOpacity", parseFloat(e.target.value))
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
                value={localConfig.blur}
                onChange={(e) =>
                  handleConfigChange("blur", parseFloat(e.target.value))
                }
                className="h-9"
              />
            </div>
            <div>
              <Label>
                Gradient
                <PopoverHelper text="Define the color gradient for the heatmap. Each key represents a point in the gradient (0 to 1), and the value is the color." />
              </Label>
              {Object.entries(localConfig.gradient).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2 mt-2">
                  <Input
                    type="text"
                    value={key}
                    onChange={(e) => {
                      const newGradient = { ...localConfig.gradient };
                      delete newGradient[key];
                      newGradient[e.target.value] = value;
                      debouncedOnChange("gradient", newGradient);
                    }}
                    className="w-20 h-9"
                  />
                  <Input
                    type="color"
                    value={value}
                    onChange={(e) => {
                      const newGradient = {
                        ...localConfig.gradient,
                        [key]: e.target.value,
                      };
                      debouncedOnChange("gradient", newGradient);
                    }}
                    className="w-20 h-9"
                  />
                </div>
              ))}
              <button
                onClick={() => {
                  const newGradient = {
                    ...localConfig.gradient,
                    [""]: "#000000",
                  };
                  debouncedOnChange("gradient", newGradient);
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
};

export default HeatmapAdvancedConfig;
