"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import FloorplanCanvas from "@/components/FloorplanCanvas";
import {
  startSurvey,
  getSurveyData,
  updateIperfServer,
  updateFloorplanImage,
  updateDbField,
  uploadImage,
} from "@/lib/actions";
import { Database, SurveyPoint, IperfTest } from "@/lib/database";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MetricType } from "@/lib/heatmapGenerator";
import React from "react";

const Loader = ({ className }: { className?: string }) => {
  return <Loader2 className={cn("animate-spin", className)} />;
};

export default function Home() {
  const [surveyData, setSurveyData] = useState<Database | null>(null);
  const [status, setStatus] = useState<"ready" | "running" | "error">("ready");
  const [dbPath, setDbPath] = useState("data/db3.json");
  const [sudoerPassword, setSudoerPassword] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadSurveyData();
  }, []);

  const loadSurveyData = async () => {
    const data = await getSurveyData(dbPath);
    setSurveyData(data);
  };

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
          : null
      );
    } catch (error) {
      setAlertMessage(`An error occurred: ${error}`);
      setStatus("error");
      toast({
        title: "An error occurred",
        description: "Something went wrong, please check the logs",
        variant: "destructive",
      });
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
        WiFi Heatmap
      </h1>

      <div className="bg-blue-100 text-blue-700 p-4 rounded-lg mb-6">
        Status:{" "}
        <span className="font-semibold">
          {status}
          {status === "running" && (
            <Loader className="inline ml-2 animate-spin" />
          )}
        </span>
      </div>
      {status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{alertMessage}</AlertDescription>
        </Alert>
      )}

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
            <Label htmlFor="floorplanImage">Floorplan Image</Label>
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
          <div className="space-y-2 flex flex-col">
            <div>Measurements: {surveyData.surveyPoints.length}</div>
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
      <Toaster />
    </div>
  );
}
