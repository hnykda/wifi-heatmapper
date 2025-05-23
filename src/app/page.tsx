"use client";

import { SettingsProvider } from "@/components/GlobalSettings";
import TabPanel from "@/components/TabPanel";
export default function App() {
  return (
    <SettingsProvider>
      <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">
        WiFi Heatmapper
      </h1>
      <p className="w-1/2 mx-auto">
        Measure Wi-Fi signal strength and network throughput, and draw heat maps
        of the resulting data. For more information, see{" "}
        <a href="https://github.com/hnykda/wifi-heatmapper">the Github repo</a>.
        <br />
      </p>
      <TabPanel />
    </SettingsProvider>
  );
}
