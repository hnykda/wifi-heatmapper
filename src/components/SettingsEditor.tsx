import { useSettings } from "@/components/GlobalSettings";
import { PasswordInput } from "./PasswordInput";
import HeatmapAdvancedConfig from "./HeatmapAdvancedConfig";

// import { FileInput } from "./FileInput";

export default function SettingsEditor() {
  const { settings, updateSettings } = useSettings();

  return (
    <table className="w-auto">
      <tbody>
        <tr>
          <td className="text-right pr-4">
            <label>Floor Plan:</label>
          </td>
          <td>
            <input
              type="text"
              className="border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.floorplanImagePath}
              onChange={(e) =>
                updateSettings({ floorplanImagePath: e.target.value })
              }
            />
          </td>
        </tr>
        {/* <tr>
          <td className="text-right pr-4">
            <label>New Floor Plan:</label>
          </td>
          <td>
            <FileInput
              onFileSelect={(e) =>
                updateSettings({ floorplanImagePath: `media/${e.name}` })
              }
            />
          </td>
        </tr> */}
        <tr>
          <td className="text-right pr-4">
            <label>iperfServer:</label>
          </td>
          <td>
            <input
              type="text"
              className="border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.iperfServerAdrs}
              onChange={(e) =>
                updateSettings({ iperfServerAdrs: e.target.value })
              }
            />
          </td>
        </tr>
        <tr>
          <td className="text-right pr-4">
            <label>Test Duration:</label>
          </td>
          <td>
            <input
              type="number"
              className="border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.testDuration}
              onChange={(e) =>
                updateSettings({ testDuration: Number(e.target.value) })
              }
            />
          </td>
        </tr>
        {/* <tr>
          <td className="text-right pr-4">
            <label>sudoerPassword:</label>
          </td>
          <td>
            <input
              type="text"
              className="border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.sudoerPassword}
              onChange={(e) =>
                updateSettings({ sudoerPassword: e.target.value })
              }
            />
          </td>
        </tr> */}
        <tr>
          <td className="text-right pr-4">
            <label>sudo Password:</label>
          </td>
          <td>
            <PasswordInput
              value={settings.sudoerPassword}
              onChange={(e) => updateSettings({ sudoerPassword: e })}
            />

            {/* <input
              type="text"
              className="border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.sudoerPassword}
              onChange={(e) =>
                updateSettings({ sudoerPassword: e.target.value })
              }
            /> */}
          </td>
        </tr>
        <tr>
          <td colSpan={2} className="text-right pr-4">
            <HeatmapAdvancedConfig
            // settings={settings}
            // // config={heatmapConfig}
            // // setConfig={setHeatmapConfig}
            />
          </td>
        </tr>
        {/* <label>Auto-Save:</label>
      <input
        type="checkbox"
        checked={settings.autoSave}
        onChange={(e) => updateSettings({ autoSave: e.target.checked })}
      /> */}
      </tbody>
    </table>
  );
}
