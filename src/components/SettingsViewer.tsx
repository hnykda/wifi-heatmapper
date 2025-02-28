import { useSettings } from "./GlobalSettings";

export default function SettingsViewer() {
  const { settings } = useSettings(); // Access global settings

  return (
    <div>
      <h2>Configuration</h2>
      <p>Floor Plan: {settings.savedSettings.floorplanImagePath}</p>
      <p>iperfServer: {settings.savedSettings.iperfServerAdrs}</p>
      <p>Test duration: {settings.savedSettings.testDuration}</p>
    </div>
  );
}
