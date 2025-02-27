import { useSettings } from "./GlobalSettings";

export default function SettingsViewer() {
  const { settings } = useSettings(); // Access global settings

  return (
    <div>
      <h2>Project Settings</h2>
      <p>Floor Plan: {settings.savedSettings.floorplanImagePath}</p>
      <p>Auto-Save: {settings.savedSettings.iperfServerAdrs}</p>
      <p>File Path: {settings.savedSettings.testDuration}</p>
    </div>
  );
}
