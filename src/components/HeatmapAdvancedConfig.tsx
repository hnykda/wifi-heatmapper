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
// import { HeatmapConfig } from "@/lib/types";
import { useSettings } from "@/components/GlobalSettings";
import { HeatmapSettings } from "@/lib/types";
import { debounce } from "lodash";
import { execAsync } from "@/lib/server-utils";
import { rgbaToHex, hexToRgba } from "@/lib/utils-gradient";

// const logger = getLogger("HeatmapAdvancedConfig");

export function HeatmapAdvancedConfig() {
  const { settings, updateSettings } = useSettings();

  const debouncedUpdateSettings = debounce(
    (settings: Partial<HeatmapSettings>) => updateSettings(settings),
    500,
  );

  const sortedGradientEntries = () => {
    return Object.entries(settings.gradient).sort(([a], [b]) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return isNaN(numA) || isNaN(numB) ? 0 : numA - numB;
    });
  };

  /**
   * Run the command from id="cmdToRun" and show stdout and stderr
   * Also display error if it's caught
   * Runs on the client (which is OK, since that's also the same machine as the server)
   */
  const runCommand = async () => {
    const cmd = (document.getElementById("cmdToRun") as HTMLInputElement).value;
    if (cmd) {
      console.log(`command to run: "${cmd}"`);
      try {
        const { stdout, stderr } = await execAsync(cmd);
        console.log(`STDOUT: "${stdout}"`);
        console.log(`STDERR: "${stderr}"`);
      } catch (err) {
        console.log(`CAUGHT ERR:\n${err}`);
      }
    }
  };

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="advanced-config">
        <AccordionTrigger className="text-lg font-bold">
          Advanced Configuration
        </AccordionTrigger>
        <AccordionContent>
          <table className="flex flex-row gap-4">
            <tbody>
              <tr>
                <td>
                  <Label htmlFor="maxOpacity">
                    Max Opacity&nbsp;
                    <PopoverHelper text="The maximum opacity of the heatmap points. Values range from 0 to 1." />
                  </Label>
                </td>
                <td>
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
                </td>
              </tr>
              <tr>
                <td>
                  <Label htmlFor="minOpacity">
                    Min Opacity&nbsp;
                    <PopoverHelper text="The minimum opacity of the heatmap points. Values range from 0 to 1." />
                  </Label>
                </td>
                <td>
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
                </td>
              </tr>
              <tr>
                <td>
                  <Label htmlFor="blur">
                    Blur&nbsp;
                    <PopoverHelper text="The amount of blur applied to the heatmap. Values range from 0 to 1." />
                  </Label>
                </td>
                <td>
                  <Input
                    id="blur"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.blur}
                    onChange={(e) =>
                      debouncedUpdateSettings({
                        blur: parseFloat(e.target.value),
                      })
                    }
                    className="h-9"
                  />
                </td>
              </tr>
              <tr>
                <td className="align-top pr-2 pt-2">
                  <Label className="inline-flex items-start">
                    Gradient&nbsp;
                    <PopoverHelper text="Define the color gradient for the heatmap. Each key represents a point in the gradient (0 to 1), and the value is the color." />
                  </Label>
                </td>
                <td colSpan={2}>
                  {" "}
                  <div>
                    <div className="flex items-center space-x-2 mt-2 mb-1 font-semibold">
                      <span className="w-20 text-center">Position</span>
                      <span className="w-20 text-center">Color</span>
                      <span className="w-20 text-center">Opacity</span>
                    </div>
                    {sortedGradientEntries().map(([key, value]) => {
                      const hexColor = rgbaToHex(value);
                      const alpha = parseFloat(value.split(",")[3]) || 1;

                      return (
                        <div
                          key={key}
                          className="flex items-center space-x-2 mt-2"
                        >
                          <Input
                            type="text"
                            value={key}
                            onChange={(e) => {
                              const newGradient = { ...settings.gradient };
                              delete newGradient[parseInt(key)];
                              newGradient[parseInt(e.target.value)] = value;
                              debouncedUpdateSettings({
                                gradient: newGradient,
                              });
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
                              debouncedUpdateSettings({
                                gradient: newGradient,
                              });
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
                              debouncedUpdateSettings({
                                gradient: newGradient,
                              });
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
                </td>
              </tr>
              <tr>
                <td className="align-top pr-2 pt-2">
                  <Label htmlFor="cmdToRun" className="inline-flex items-start">
                    Command to test&nbsp;
                    <PopoverHelper text="Enter a command-line command to test it. View its output in the Console window." />{" "}
                  </Label>
                </td>
                <td>
                  <input
                    type="text"
                    id="cmdToRun"
                    className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
                    defaultValue=""
                  />
                  <button
                    className="mt-2 px-2 py-1 bg-blue-500 text-white rounded"
                    onClick={runCommand}
                  >
                    Do it...
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          {/* </div> */}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export default HeatmapAdvancedConfig;
