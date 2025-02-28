"use client";

import { SettingsProvider } from "@/components/GlobalSettings";
// import SettingsEditor from "./components/SettingsEditor";
import TabPanel from "@/components/TabPanel";
export default function App() {
  return (
    <SettingsProvider>
      <h1>Wifi Heatmapper</h1>
      <TabPanel />
    </SettingsProvider>
  );
}
