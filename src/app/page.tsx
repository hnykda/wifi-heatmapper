"use client";
import React, { useState, useEffect } from "react";
import FloorplanCanvas from "@/components/FloorplanCanvas";
import {
  startSurvey,
  getSurveyData,
  updateIperfServer,
  updateFloorplanImage,
  updateDbField,
} from "@/lib/actions";
import { Database } from "@/lib/database";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const Loader = ({ className }: { className?: string }) => {
  return <Loader2 className={cn("animate-spin", className)} />;
};

export default function Home() {
  const [surveyData, setSurveyData] = useState<Database | null>(null);
  const [status, setStatus] = useState<
    | "Ready"
    | "Please set iperf server address"
    | "Please set sudoer password so we can run wdutil info command"
    | "Starting survey..."
    | "Survey complete"
  >("Ready");
  const [dbPath, setDbPath] = useState("data/db3.json");
  const [sudoerPassword, setSudoerPassword] = useState("");

  useEffect(() => {
    loadSurveyData();
  }, []);

  const loadSurveyData = async () => {
    const data = await getSurveyData(dbPath);
    setSurveyData(data);
  };

  const handlePointClick = async (x: number, y: number) => {
    if (!surveyData?.iperfServer) {
      setStatus("Please set iperf server address");
      return;
    }

    if (!sudoerPassword) {
      setStatus("Please set sudoer password so we can run wdutil info command");
      return;
    }

    setStatus("Starting survey...");
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
        : null
    );
    setStatus("Survey complete");
  };

  const handleIperfServerChange = async (server: string) => {
    await updateIperfServer(dbPath, server);
    loadSurveyData();
  };

  const handleFloorplanChange = async (imagePath: string) => {
    await updateFloorplanImage(dbPath, imagePath);
    loadSurveyData();
  };

  const handleApMappingChange = async (apMapping: string) => {
    await updateDbField(
      dbPath,
      "apMapping",
      apMapping.split("\n").map((line) => {
        const [apName, macAddress] = line.split(",");
        return { apName, macAddress };
      })
    );
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

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">
        WiFi Heatmap Survey
      </h1>

      <div className="bg-blue-100 text-blue-700 p-4 rounded-lg mb-6">
        Status:{" "}
        <span className="font-semibold">
          {status}
          {status === "Starting survey..." && (
            <Loader className="inline ml-2 animate-spin" />
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dbPath">Database Path</Label>
            <div className="flex">
              <Input
                id="dbPath"
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                placeholder="Database path"
                className="rounded-r-none h-9"
              />
              <Button
                onClick={() => loadSurveyData()}
                className="rounded-l-none h-9"
              >
                Load
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iperfServer">iperf3 Server Address</Label>
            <Input
              id="iperfServer"
              value={surveyData.iperfServer}
              onChange={(e) => handleIperfServerChange(e.target.value)}
              placeholder="iperf3 server address"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sudoerPassword">Sudoer Password</Label>
            <Input
              id="sudoerPassword"
              type="password"
              value={sudoerPassword}
              onChange={(e) => {
                setSudoerPassword(e.target.value);
              }}
              placeholder="Sudoer password (not saved to file)"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="floorplanImage">Floorplan Image Path</Label>
            <Input
              id="floorplanImage"
              value={surveyData.floorplanImage}
              onChange={(e) => handleFloorplanChange(e.target.value)}
              placeholder="Floorplan image path"
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="testDuration">Test Duration (seconds)</Label>
            <Input
              id="testDuration"
              type="number"
              placeholder="Test duration [s]"
              value={surveyData.testDuration}
              min={1}
              max={999}
              onChange={(e) => handleTestDurationChange(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apMapping">AP Mapping</Label>
            <Textarea
              id="apMapping"
              rows={4}
              value={
                surveyData.apMapping
                  ? surveyData.apMapping
                      .map((ap) => `${ap.apName},${ap.macAddress}`)
                      .join("\n")
                  : ""
              }
              onChange={(e) => handleApMappingChange(e.target.value)}
              placeholder="AP Mapping (apName,macAddress)"
              className="resize-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        <FloorplanCanvas
          status={status}
          image={surveyData.floorplanImage}
          points={surveyData.surveyPoints}
          apMapping={surveyData.apMapping}
          onPointClick={handlePointClick}
        />
      </div>
    </div>
  );
}
