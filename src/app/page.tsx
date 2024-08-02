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
import { Database } from "@/lib/database";
import { cn, getDefaults } from "@/lib/utils";
import { Info, Loader, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Heatmaps } from "@/components/Heatmaps";
import { ClickableFloorplan } from "@/components/Floorplan";
import { PopoverHelper } from "@/components/PopoverHelpText";

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dbPath">
              Database Path{" "}
              <PopoverHelper text="Path to the database file. It will be created if it doesn't exist. All measurements and most of the settings will be saved to this file. Use one file per single database file." />
            </Label>
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
            <Label htmlFor="iperfServer">
              iperf3 Server Address{" "}
              <PopoverHelper text="An IP address of the server where iperf3 is running." />
            </Label>
            <Input
              id="iperfServer"
              value={surveyData.iperfServer}
              onChange={(e) => handleIperfServerChange(e.target.value)}
              placeholder="192.168.0.42"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sudoerPassword">
              Sudoer Password{" "}
              <PopoverHelper text="This is needed to run wdutil info command. It will not be saved to DB file." />
            </Label>
            <Input
              id="sudoerPassword"
              type="password"
              value={sudoerPassword}
              onChange={(e) => {
                setSudoerPassword(e.target.value);
              }}
              placeholder="passw0rd"
              className="h-9"
            />
          </div>

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
          <div className="space-y-2">
            <Label htmlFor="testDuration">
              Test Duration (seconds){" "}
              <PopoverHelper text="How long each iperf3 measurement will last. 10 seconds might be enough. Higher value will give you more accurate results." />
            </Label>
            <Input
              id="testDuration"
              type="number"
              placeholder="10"
              value={surveyData.testDuration}
              min={1}
              max={999}
              onChange={(e) => handleTestDurationChange(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apMapping">
              AP Mapping{" "}
              <PopoverHelper
                text="A list of AP names and MAC addresses. It will be used to map the measurements to the APs. This is useful when you have multiple APs and your device might connect to different
              ones at different places. It's comma separated APName,MACAddress; one mapping per line, no separators in the mac address, and in lowercase."
              />
            </Label>
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
              placeholder="someNiceNameAP1,9e05d696e830"
              className="resize-none"
            />
          </div>
          <div className="space-y-2 flex flex-col">
            {surveyData.surveyPoints?.length > 0 && (
              <div>Measurements: {surveyData.surveyPoints.length}</div>
            )}
          </div>
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
              status={status}
            />
            {surveyData.surveyPoints?.length > 0 && (
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
      <Toaster />
    </div>
  );
}
