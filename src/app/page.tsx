"use client";

import { SettingsProvider } from "@/components/GlobalSettings";
// import SettingsEditor from "./components/SettingsEditor";
import TabPanel from "@/components/TabPanel";
export default function App() {
  return (
    <SettingsProvider>
      <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">
        WiFi Heatmap
      </h1>
      <TabPanel />
    </SettingsProvider>
  );
}
