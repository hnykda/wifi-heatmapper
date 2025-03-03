import { useSettings } from "./GlobalSettings";

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
        <tr>
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

// import React from "react";
// import setDbPath from "../app/page";
// import loadSurveyData from "../app/page";
// import handleIperfServerChange from "../app/page";
// import handleTestDurationChange from "../app/page";
// import handleFloorplanChange from "../app/page";
// import handleApMappingChange from "../app/page";
// import setSudoerPassword from "../app/page";
// import EditableField from "@/components/EditableField";
// import EditableApMapping from "@/components/ApMapping";
// import { PopoverHelper } from "./PopoverHelpText";
// import { Input } from "./ui/input";
// import { Label } from "./ui/label";
// import { SurveyPoint, ApMapping } from "../lib/types";

// interface SettingsProps {
//   surveyPoints: SurveyPoint[];
//   floorplanImage: string;
//   iperfServer: string;
//   testDuration: number;
//   apMapping: ApMapping[];
//   dbPath: string;
//   platform: string;
//   sudoerPw: string;
// }

// export const Settings: React.FC<{ prefs: SettingsProps }> = ({ prefs }) => {
//   return (
//     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
//       <div className="space-y-4">
//         <EditableField
//           label="Database Path"
//           value={prefs.dbPath}
//           onSave={(newValue) => {
//             setDbPath(newValue);
//             loadSurveyData();
//           }}
//           placeholder="Database path"
//           helpText="Path to the database file to store settings and results."
//         />

//         <EditableField
//           label="iperf3 Server Address"
//           value={prefs.iperfServer}
//           onSave={handleIperfServerChange}
//           placeholder="192.168.0.42"
//           helpText="IP address of the iperf3 server to test against. Can be in the form of 192.168.0.42 or with port 192.168.0.42:5201"
//         />

//         {prefs.platform === "macos" && (
//           <EditableField
//             label="Sudoer Password"
//             value={prefs.pw}
//             onSave={setSudoerPassword}
//             type="password"
//             placeholder="passw0rd"
//             helpText="Password for sudoer user (needed for wdutil info command). macOS only"
//           />
//         )}

//         {prefs.platform === "linux" && (
//           <EditableField
//             label="WLAN Interface ID"
//             value={prefs.wlanInterfaceId}
//             onSave={setWlanInterfaceId}
//             placeholder="wlp3s0"
//             helpText="ID of the WLAN interface to use for scanning. We try to infer it automatically, but you can set it manually if it fails. Linux only"
//           />
//         )}

//         <div className="space-y-2">
//           <Label htmlFor="floorplanImage">
//             Floorplan Image{" "}
//             <PopoverHelper text="Image of the floorplan you want to measure your wifi on. Think about it as a map." />
//           </Label>
//           <Input
//             id="floorplanImage"
//             type="file"
//             accept="image/*"
//             onChange={handleFloorplanChange}
//             className="h-9"
//           />
//         </div>
//         <div>
//           <h3 className="font-bold">Platform: {prefs.platform}</h3>
//         </div>
//       </div>

//       <div className="space-y-4">
//         <EditableField
//           label="Test Duration (seconds)"
//           value={prefs.testDuration.toString()}
//           onSave={(newValue) => handleTestDurationChange(newValue)}
//           type="number"
//           placeholder="10"
//           helpText="Duration of the each test in seconds."
//         />

//         <EditableApMapping
//           apMapping={prefs.apMapping || []}
//           onSave={handleApMappingChange}
//         />
//       </div>
//     </div>
//   );
// };

// // export default Settings;
