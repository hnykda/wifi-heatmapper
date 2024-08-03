"use client";
import { useState, useEffect, useCallback } from "react";
import {
  startSurvey,
  getSurveyData,
  updateIperfServer,
  updateFloorplanImage,
  updateDbField,
  uploadImage,
} from "@/lib/actions";
import { ApMapping, Database, SurveyPoint } from "@/lib/types";
import { getDefaults } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import React from "react";

import { Heatmaps } from "@/components/Heatmaps";
import { ClickableFloorplan } from "@/components/Floorplan";
import { PopoverHelper } from "@/components/PopoverHelpText";
import EditableField from "@/components/EditableField";
import EditableApMapping from "@/components/ApMapping";
import PointsTable from "@/components/PointsTable";

export default function Home() {
  const [surveyData, setSurveyData] = useState<Database>(getDefaults());
  const [status, setStatus] = useState<"ready" | "running" | "error">("ready");
  const [dbPath, setDbPath] = useState("data/db.json");
  const [sudoerPassword, setSudoerPassword] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { toast } = useToast();

  const loadSurveyData = useCallback(async () => {
    const data = await getSurveyData(dbPath);
    setSurveyData(data);
  }, [dbPath]);

  useEffect(() => {
    loadSurveyData();
  }, [loadSurveyData]);

  const handlePointClick = async (x: number, y: number) => {
    setAlertMessage("");
    setStatus("running");
    if (!surveyData?.iperfServer) {
      setAlertMessage("Please set iperf server address");
      setStatus("error");
      toast({
        title: "An error occurred",
        description: "Please set iperf server address",
        variant: "destructive",
      });
      return;
    }

    if (!sudoerPassword) {
      setAlertMessage(
        "Please set sudoer password so we can run wdutil info command"
      );
      toast({
        title: "Please set sudoer password",
        description:
          "Please set sudoer password so we can run wdutil info command",
        variant: "destructive",
      });
      setStatus("error");
      return;
    }

    toast({
      title: "Starting measurement...",
      description: "Please wait...",
    });
    try {
      const newPoint = await startSurvey(dbPath, x, y, {
        testDuration: surveyData.testDuration,
        sudoerPassword,
      });
      setSurveyData((prev) =>
        prev
          ? {
              ...prev,
              surveyPoints: [...prev.surveyPoints, newPoint],
            }
          : getDefaults()
      );
    } catch (error) {
      setAlertMessage(`An error occurred: ${error}`);
      setStatus("error");
      toast({
        title: "An error occurred",
        description: "Something went wrong, please check the logs",
        variant: "destructive",
      });
      return;
    }
    setStatus("ready");
    toast({
      title: "Measurement complete",
      description: "Measurement complete",
    });
  };

  const handleIperfServerChange = async (server: string) => {
    await updateIperfServer(dbPath, server);
    loadSurveyData();
  };

  const handleFloorplanChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    await uploadImage(dbPath, formData);
    await updateFloorplanImage(dbPath, `media/${file.name}`);
    loadSurveyData();
  };

  const handleApMappingChange = async (apMapping: ApMapping[]) => {
    await updateDbField(dbPath, "apMapping", apMapping);
    loadSurveyData();
  };

  const handleTestDurationChange = async (testDuration: string) => {
    await updateDbField(dbPath, "testDuration", parseInt(testDuration));
    loadSurveyData();
  };

  if (!surveyData)
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );

  const handleDelete = (ids: string[]) => {
    setSurveyData((prev) => {
      const newPoints = prev.surveyPoints.filter(
        (point) => !ids.includes(point.id)
      );
      updateDbField(dbPath, "surveyPoints", newPoints);
      return {
        ...prev,
        surveyPoints: newPoints,
      };
    });
  };

  const updateDatapoint = (id: string, data: Partial<SurveyPoint>) => {
    setSurveyData((prev) => {
      const newPoints = prev.surveyPoints.map((point) =>
        point.id === id ? { ...point, ...data } : point
      );
      updateDbField(dbPath, "surveyPoints", newPoints);
      return {
        ...prev,
        surveyPoints: newPoints,
      };
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">
        WiFi Heatmap
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-4">
          <EditableField
            label="Database Path"
            value={dbPath}
            onSave={(newValue) => {
              setDbPath(newValue);
              loadSurveyData();
            }}
            placeholder="Database path"
            helpText="Path to the database file to store settings and results."
          />

          <EditableField
            label="iperf3 Server Address"
            value={surveyData.iperfServer}
            onSave={handleIperfServerChange}
            placeholder="192.168.0.42"
            helpText="IP address of the iperf3 server against which the tests will be run. Can be in the form of 192.168.0.42 or with port 192.168.0.42:5201"
          />

          <EditableField
            label="Sudoer Password"
            value={sudoerPassword}
            onSave={setSudoerPassword}
            type="password"
            placeholder="passw0rd"
            helpText="Password for sudoer user (needed for wdutil info command)."
          />

          <div className="space-y-2">
            <Label htmlFor="floorplanImage">
              Floorplan Image{" "}
              <PopoverHelper text="Image of the floorplan you want to measure your wifi on. Think about it as a map." />
            </Label>
            <Input
              id="floorplanImage"
              type="file"
              accept="image/*"
              onChange={handleFloorplanChange}
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-4">
          <EditableField
            label="Test Duration (seconds)"
            value={surveyData.testDuration.toString()}
            onSave={(newValue) => handleTestDurationChange(newValue)}
            type="number"
            placeholder="10"
            helpText="Duration of the each test in seconds."
          />

          <EditableApMapping
            apMapping={surveyData.apMapping || []}
            onSave={handleApMappingChange}
          />
        </div>
      </div>

      {status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{alertMessage}</AlertDescription>
        </Alert>
      )}
      {surveyData.floorplanImage ? (
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="space-y-8">
            <ClickableFloorplan
              image={surveyData.floorplanImage}
              setDimensions={setDimensions}
              dimensions={dimensions}
              points={surveyData.surveyPoints}
              onPointClick={handlePointClick}
              apMapping={surveyData.apMapping}
              onDelete={handleDelete}
              updateDatapoint={updateDatapoint}
              status={status}
            />
            {surveyData.surveyPoints?.length > 1 && (
              <Heatmaps
                image={surveyData.floorplanImage}
                points={surveyData.surveyPoints}
                dimensions={dimensions}
              />
            )}
          </div>
        </div>
      ) : (
        <Alert>
          <AlertTitle>No floorplan image</AlertTitle>
          <AlertDescription>
            Please upload a floorplan image to start the measurements.
          </AlertDescription>
        </Alert>
      )}
      {surveyData.surveyPoints?.length > 0 && (
        <PointsTable
          data={surveyData.surveyPoints}
          onDelete={handleDelete}
          updateDatapoint={updateDatapoint}
          apMapping={surveyData.apMapping}
        />
      )}
      <Toaster />
    </div>
  );
}
