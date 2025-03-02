"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import SettingsViewer from "@/components/SettingsViewer";
import SettingsEditor from "@/components/SettingsEditor";
import ClickableFloorplan from "@/components/Floorplan";

export default function TabPanel() {
  const [activeTab, setActiveTab] = useState("tab1"); // State to track the active tab

  return (
    <div className="w-full max-w-md">
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
          {" "}
          <SettingsEditor />
        </Tabs.Content>
        <Tabs.Content value="tab2" className="p-4">
          <ClickableFloorplan />
          {/* image={surveyData.floorplanImage}
            setDimensions={setDimensions}
            dimensions={dimensions}
            points={surveyData.surveyPoints}
            onPointClick={handlePointClick}
            apMapping={surveyData.apMapping}
            onDelete={handleDelete}
            updateDatapoint={updateDatapoint}
            status={status}
        </Tabs.Content>
        <Tabs.Content value="tab3" className="p-4">
          <p>This displays Heat Maps.</p>
          
          /> */}
        </Tabs.Content>
        <Tabs.Content value="tab4" className="p-4">
          <SettingsViewer />
          <p>This displays Survey Points</p>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
