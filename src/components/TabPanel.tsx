import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { useSettings } from "./GlobalSettings";

// import SettingsViewer from "@/components/SettingsViewer";

import SettingsEditor from "@/components/SettingsEditor";
import ClickableFloorplan from "@/components/Floorplan";
import { Heatmaps } from "@/components/Heatmaps";
import PointsTable from "@/components/PointsTable";

export default function TabPanel() {
  const [activeTab, setActiveTab] = useState("tab1"); // State to track the active tab
  const { settings, updateSettings, surveyPointActions } = useSettings();

  return (
    <div className="w-full">
      {/* Button to change tabs dynamically
      <button
        className="mb-2 p-2 bg-blue-500 text-white rounded"
        onClick={() => setActiveTab("tab2")}
      >
        Go to Tab 2
      </button> */}

      {/* Tabs Root with controlled state */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        {/* Tab List */}
        <Tabs.List className="flex border-b">
          <Tabs.Trigger
            value="tab1"
            className="px-4 py-2 border-b-2 border-transparent hover:border-gray-400 focus:border-blue-500"
          >
            Configuration
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tab2"
            className="px-4 py-2 border-b-2 border-transparent hover:border-gray-400 focus:border-blue-500"
          >
            Floor&nbsp;Plan
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tab3"
            className="px-4 py-2 border-b-2 border-transparent hover:border-gray-400 focus:border-blue-500"
          >
            Heat&nbsp;Maps
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tab4"
            className="px-4 py-2 border-b-2 border-transparent hover:border-gray-400 focus:border-blue-500"
          >
            Survey&nbsp;Points
          </Tabs.Trigger>
        </Tabs.List>

        {/* Tab Content */}
        <Tabs.Content value="tab1" className="p-4">
          <SettingsEditor />
        </Tabs.Content>

        <Tabs.Content value="tab2" className="p-4">
          <ClickableFloorplan />
        </Tabs.Content>

        <Tabs.Content value="tab3" className="p-4">
          <p>This displays Heat Maps.</p>
          <Heatmaps
            image={settings.floorplanImagePath}
            points={settings.surveyPoints}
            dimensions={settings.dimensions}
          />
        </Tabs.Content>

        <Tabs.Content value="tab4" className="p-4">
          {/* <SettingsViewer /> */}
          <p>This displays Survey Points</p>
          <PointsTable
            data={settings.surveyPoints}
            surveyPointActions={surveyPointActions}
            apMapping={settings.apMapping}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
