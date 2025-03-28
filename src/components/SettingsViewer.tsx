import { useSettings } from "./GlobalSettings";

export default function SettingsViewer() {
  const { settings } = useSettings(); // Access global settings

  return (
    <div>
      <h2>Configuration</h2>
      <p>Floor Plan: {settings.floorplanImagePath}</p>
      <p>iperfServer: {settings.iperfServerAdrs}</p>
      <p>Test duration: {settings.testDuration}</p>
      <p>sudoerPassword: {settings.sudoerPassword}</p>
    </div>
  );
}
