"use client";

import { useState, useEffect, useCallback } from "react";
import {
  startSurvey,
  getSurveyData,
  updateIperfServer,
  updateFloorplanImage,
  updateDbField,
  uploadImage,
  getPlatform,
  inferWifiDeviceIdOnLinux,
} from "@/lib/actions";
import { ApMapping, Database, SurveyPoint } from "@/lib/types";
import { getDefaults } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings } from "@/components/SettingsEditor";
import { Heatmaps } from "@/components/Heatmaps";
import { ClickableFloorplan } from "@/components/Floorplan";
import PointsTable from "@/components/PointsTable";

export default function Home() {
  const [surveyData, setSurveyData] = useState<Database>(getDefaults());
  const [status, setStatus] = useState<"ready" | "running" | "error">("ready");
  const [dbPath, setDbPath] = useState("data/db.json");
  const [sudoerPassword, setSudoerPassword] = useState("");
  const [wlanInterfaceId, setWlanInterfaceId] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [platform, setPlatform] = useState("");
  const { toast } = useToast();

  /**
   * loadSurveyData - define a function to update the (global) survey data
   */
  const loadSurveyData = useCallback(async () => {
    const data = await getSurveyData(dbPath);
    setSurveyData(data);
  }, [dbPath]);

  /**
   * useEffect - define a function to be called when `loadSurveyPath` changes
   */
  useEffect(() => {
    loadSurveyData();
    getPlatform().then((platform) => {
      setPlatform(platform);
      if (platform === "linux" && !wlanInterfaceId) {
        inferWifiDeviceIdOnLinux().then((wlanInterfaceId) => {
          setWlanInterfaceId(wlanInterfaceId);
        });
      }
    });
  }, [loadSurveyData]);

  /**
   * handlePointClick
   * Survey the sinal strength and speed tests at the point
   * @param x X position of the click
   * @param y Y position of the click
   * @returns null - but uses Toast to indicate proress
   */
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

    const runningPlatform = process.platform;

    if (!sudoerPassword && runningPlatform == "darwin") {
      console.warn(
        "No sudoer password set, but running on macOS where it's required for wdutil info command",
      );
      setAlertMessage(
        "Please set sudoer password so we can run wdutil info command",
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
        wlanInterfaceId,
      });
      setSurveyData((prev: Database) =>
        prev
          ? {
              ...prev,
              surveyPoints: [...prev.surveyPoints, newPoint],
            }
          : getDefaults(),
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

  /**
   * handleIperfServerChange
   * @param server new address or iperf3 server
   */
  const handleIperfServerChange = async (server: string) => {
    await updateIperfServer(dbPath, server);
    loadSurveyData();
  };

  /**
   * handleFloorPlanChange
   * Takes path to the floorplan file, uploads to internal storage
   * Reloads the surveydata
   * @param event new file to be used as floor plan (FORMAT????)
   * @returns null
   */
  const handleFloorplanChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    await uploadImage(dbPath, formData);
    await updateFloorplanImage(dbPath, `media/${file.name}`);
    loadSurveyData();
  };

  /**
   * handleApMappingChange
   * I don't really understand AP mapping...
   * @param apMapping the AP mapping
   */
  const handleApMappingChange = async (apMapping: ApMapping[]) => {
    await updateDbField(dbPath, "apMapping", apMapping);
    loadSurveyData();
  };

  /**
   * handleTestDurationChane
   * @param testDuration - New test duration
   */
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

  /**
   * handleDelete - delete IDs from the survey
   * @param ids list of the IDs to delete
   */
  const handleDelete = async (ids: string[]) => {
    const newPoints = surveyData.surveyPoints.filter(
      (point) => !ids.includes(point.id),
    );
    await updateDbField(dbPath, "surveyPoints", newPoints);
    setSurveyData((prev: Database) => ({
      ...prev,
      surveyPoints: newPoints,
    }));
  };

  /**
   * updateDatapoint
   * @param id ID of the point to update
   * @param data to use for the point
   */
  const updateDatapoint = async (id: string, data: Partial<SurveyPoint>) => {
    const newPoints = surveyData.surveyPoints.map((point) =>
      point.id === id ? { ...point, ...data } : point,
    );
    await updateDbField(dbPath, "surveyPoints", newPoints);
    setSurveyData((prev: Database) => ({
      ...prev,
      surveyPoints: newPoints,
    }));
  };

  /**
   * return a list of the active points
   */
  const activePoints = surveyData.surveyPoints.filter(
    (point: SurveyPoint) => !point.isDisabled,
  );

  /**
   * Display the contents of the "page"
   */
  const allPrefs = { ...surveyData, sudoerPw: sudoerPassword };
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">
        WiFi Heatmap
      </h1>
      <Settings settings={allPrefs} />

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
            {activePoints.length > 1 && (
              <Heatmaps
                image={surveyData.floorplanImage}
                points={activePoints}
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
