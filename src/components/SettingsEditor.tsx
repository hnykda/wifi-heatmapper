import { useSettings } from "@/components/GlobalSettings";
import { PasswordInput } from "./PasswordInput";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import HeatmapAdvancedConfig from "./HeatmapAdvancedConfig";
import MediaDropdown from "./MediaDropdown";

export default function SettingsEditor() {
  const { settings, updateSettings, readNewSettingsFromFile } = useSettings();

  /**
   * handleNewImageFile - given the name of a new image file,
   *    get the settings for that floor image
   * @param theFile - name of the new image file
   */
  function handleNewImageFile(theFile: string): void {
    readNewSettingsFromFile(theFile); // tell the parent about the new file
  }

  return (
    <table className="w-auto">
      <tbody>
        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="Files" className="font-bold text-lg">
              Floor plan&nbsp;
              <PopoverHelper text="Choose a file to be used as a background image, or upload another PNG or JPEG file." />
            </Label>
          </td>
          <td className="max-w-[400px] p-0 m-0">
            <MediaDropdown
              defaultValue={settings.floorplanImageName}
              onChange={(val) => handleNewImageFile(val)}
            />
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="iperfServer" className="font-bold text-lg">
              iperfServer&nbsp;
              <PopoverHelper text="Address of an iperf3 server. Set to 'localhost' to ignore." />
            </Label>{" "}
          </td>
          <td>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.iperfServerAdrs}
              onChange={(e) =>
                updateSettings({ iperfServerAdrs: e.target.value.trim() })
              }
            />
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="testDuration" className="font-bold text-lg">
              Test Duration&nbsp;
              <PopoverHelper text="Duration of the speed test (in seconds)." />
            </Label>
          </td>
          <td>
            <input
              type="number"
              className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.testDuration}
              onChange={(e) =>
                updateSettings({ testDuration: Number(e.target.value.trim()) })
              }
            />
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="sudoPassword" className="font-bold text-lg">
              sudo password&nbsp;
              <PopoverHelper text="Enter the sudo password: required on macOS or Linux." />
            </Label>
          </td>
          <td>
            <PasswordInput
              value={settings.sudoerPassword}
              onChange={(e) => updateSettings({ sudoerPassword: e })}
            />
          </td>
        </tr>

        <tr>
          <td colSpan={2} className="text-right">
            <HeatmapAdvancedConfig />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
