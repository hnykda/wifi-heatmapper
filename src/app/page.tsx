import { SettingsProvider } from "@/components/GlobalSettings";
import SettingsViewer from "@/components/SettingsViewer";
// import SettingsEditor from "./components/SettingsEditor";

export default function App() {
  return (
    <SettingsProvider>
      <h1>Project Manager</h1>
      <SettingsViewer />
      {/* <SettingsEditor /> */}
    </SettingsProvider>
  );
}
