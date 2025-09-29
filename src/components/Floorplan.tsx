import React, { ReactNode, useRef, useState } from "react";
import { useEffect } from "react";
import {
  getDefaultWifiResults,
  getDefaultIperfResults,
  percentageToRssi,
  rssiToPercentage,
} from "../lib/utils";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";
import { useSettings } from "./GlobalSettings";
import { HeatmapSettings, SurveyPoint } from "../lib/types";
import { checkSettings, startSurvey } from "@/lib/iperfRunner";
import { Toaster } from "@/components/ui/toaster";
import NewToast from "@/components/NewToast";
import PopupDetails from "@/components/PopupDetails";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ClickableFloorplan(): ReactNode {
  const { settings, updateSettings, surveyPointActions } = useSettings();

  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<SurveyPoint | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  // const [dimensions, setDimensions] = useState(settings.dimensions);
  const [scale, setScale] = useState(1);
  const [alertMessage, setAlertMessage] = useState("");
  const [isToastOpen, setIsToastOpen] = useState(false);
  const [surveyClick, setSurveyClick] = useState({ x: 0, y: 0 });

  /**
   * Adding test points
   * if idx is null, the following useEffect() is idle
   * else, idx is the current value of the signalStrength to use
   * Clicking the "Add test points" button calls startTestPoints()
   * that sets idx to zero, and kicks off the process
   */
  const [idx, setIdx] = useState<number | null>(null); // null = idle
  const startTestPoints = () => setIdx(0);

  useEffect(() => {
    if (idx === null) return; // back to idle

    (async () => {
      addTestPoint(idx);
      // let React commit + run effects before next iteration
      await new Promise(requestAnimationFrame);
      setIdx((i) => (i! < 100 ? i! + 5 : null));
    })();
  }, [idx]);

  /**
   * Load the image (and the canvas) when the component is mounted
   */
  useEffect(() => {
    if (settings.floorplanImagePath != "") {
      const img = new Image();
      img.src = settings.floorplanImagePath; // load the image from the path

      img.onload = () => {
        const newDimensions = { width: img.width, height: img.height };
        updateSettings({ dimensions: newDimensions });
        setImageLoaded(true);
        imageRef.current = img;
      };
      img.onerror = () => {
        console.log(`image error`);
      };
    }
  }, []);

  /**
   * addTestPoint() - add a test point
   * to the floor plan for signalStrength values 0 .. 100
   * @param idx - the signal strength to use, also sets the X position and PointID
   * @returns
   */
  function addTestPoint(idx: number): void {
    const width = settings.dimensions.width;
    const x = width / 10;
    const y = 350;
    const deltaX = (width * 0.8) / 100;
    // console.log(`width, x, y, deltaX: ${width} ${x} ${y} ${deltaX}`);
    const wifiData = getDefaultWifiResults();
    const iperfData = getDefaultIperfResults();
    wifiData.signalStrength = idx;
    wifiData.rssi = percentageToRssi(idx);
    console.log(`signal & rssi: ${idx} ${percentageToRssi(idx)}`);
    const newPoint = {
      wifiData,
      iperfData,
      x: 0,
      y,
      timestamp: Date.now(),
      id: "bad ID",
      isEnabled: true,
    };
    // console.log(`idx, x, y: ${idx} ${x + idx * deltaX} ${y}`);
    addSurveyPoint(newPoint, x + idx * deltaX, y, settings);
  }

  useEffect(() => {
    if (imageLoaded && canvasRef.current) {
      const canvas = canvasRef.current;
      const containerWidth = containerRef.current?.clientWidth || canvas.width;
      const scaleX = containerWidth / settings.dimensions.width;
      setScale(scaleX);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      drawCanvas();
    }
  }, [imageLoaded, settings.dimensions, settings.surveyPoints]);

  const handleToastIsReady = (): void => {
    measureSurveyPoint(surveyClick);
  };

  /**
   * measureSurveyPoint - make measurements for point at x/y
   * Triggered by a click on the canvas that _isn't_ an existin
   *    surveypoint
   * @param x
   * @param y
   * @returns
   */
  const measureSurveyPoint = async (surveyClick: { x: number; y: number }) => {
    const x = Math.round(surveyClick.x);
    const y = Math.round(surveyClick.y);

    const settingsErrorMessage = await checkSettings(settings);
    if (settingsErrorMessage !== "") {
      setAlertMessage(settingsErrorMessage);
      return null;
    }

    try {
      const newPoint = await startSurvey(settings);
      // null is OK - it just means that measurement was cancelled
      if (!newPoint) {
        return;
      }
      addSurveyPoint(newPoint, x, y, settings);
    } catch (error) {
      setAlertMessage(`An error occurred: ${error}`);
      return;
    }
  };

  function addSurveyPoint(
    newPoint: SurveyPoint,
    x: number,
    y: number,
    settings: HeatmapSettings,
  ): void {
    // otherwise, add the point, bumping the point number
    const pointNum = settings.nextPointNum;
    const addedPoint = {
      ...newPoint,
      x,
      y,
      isEnabled: true,
      id: `Point_${pointNum}`,
    };
    updateSettings({ nextPointNum: pointNum + 1 });
    console.log(`Updated Pointnum: ${settings.nextPointNum}`);
    surveyPointActions.add(addedPoint);
  }

  /**
   * drawCanvas - make the entire drawing go...
   */
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && imageRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // draw the image "behind" everything else
        ctx.drawImage(imageRef.current, 0, 0);
        // draw the points on top
        drawPoints(settings.surveyPoints, ctx);
      }
    }
  };

  /**
   * Close the popup window by setting selectedPoint to null
   */
  const closePopup = (): void => {
    setSelectedPoint(null);
  };
  /**
   * drawPoints - draw the list of points in the specified context
   * @param ctx
   * @param points
   */
  const drawPoints = (points: SurveyPoint[], ctx: CanvasRenderingContext2D) => {
    points.forEach((point) => drawPoint(point, ctx));
  };

  const drawPoint = (point: SurveyPoint, ctx: CanvasRenderingContext2D) => {
    if (point.wifiData) {
      const wifiInfo = point.wifiData;

      // Draw the main point
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = point.isEnabled
        ? objectToRGBAString(
            getColorAt(
              rssiToPercentage(wifiInfo.rssi) / 100,
              settings.gradient,
            ),
          )
        : "rgba(156, 163, 175, 0.9)";
      ctx.fill();

      // Draw a grey border
      ctx.strokeStyle = "grey";
      ctx.lineWidth = 2;
      ctx.closePath();
      ctx.stroke();

      const annotation = `${wifiInfo.signalStrength}%`;

      ctx.font = "12px Arial";
      const lines = annotation.split("\n");
      const lineHeight = 14;
      const padding = 4;
      const boxWidth =
        Math.max(...lines.map((line) => ctx.measureText(line).width)) +
        padding * 2;
      const boxHeight = lines.length * lineHeight + padding * 2;

      // Draw shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Draw bounding box with increased transparency
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillRect(point.x - boxWidth / 2, point.y + 15, boxWidth, boxHeight);

      // Reset shadow for text
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Draw text
      ctx.fillStyle = "#1F2937";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      lines.forEach((line, index) => {
        ctx.fillText(
          line,
          point.x,
          point.y + 15 + padding + index * lineHeight,
        );
      });
    }
  };

  /**
   * handleCanvasClick - a click anywhere in the canvas
   * @param event click point
   * @returns nothing
   */

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // if a point was selected, they have "clicked away"
    // also closes PopupDetails by clicking away
    if (selectedPoint) {
      setSelectedPoint(null);
      return;
    }

    //if the click was on a survey point,
    // then display the popup window
    // otherwise, measure the signal strength/speeds at that X/Y
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    setSurveyClick({ x: x, y: y }); // retain the X/Y of the clicked point

    // Find closest surveyPoint (within 10 units?)
    const clickedPoint = settings.surveyPoints.find(
      (point) => Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2) < 10,
    );

    // if they clicked an existing point, set the selected point
    // and display the PopupDetails
    // (not sure what all this machinery does - why not just setSelectedPoint(clickedPoint)?)
    if (clickedPoint) {
      setSelectedPoint(selectedPoint == clickedPoint ? null : clickedPoint);
      setPopupPosition({
        x: clickedPoint.x * scale,
        y: clickedPoint.y * scale,
      });
    } else {
      // otherwise, start a measurement
      setSelectedPoint(null);
      setAlertMessage("");
      setIsToastOpen(true);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold text-gray-800">
        Interactive Floorplan
      </h2>
      <div className="p-2 rounded-md text-sm">
        <p>Click on the plan to start a new measurement.</p>
        <p>
          Click on existing points to see the measurement details. You need at
          least two active (not disabled) measurements.
        </p>

        <div className="space-y-2 flex flex-col">
          {settings.surveyPoints?.length > 0 && (
            <div>Total Measurements: {settings.surveyPoints.length}</div>
          )}
        </div>
      </div>
      {alertMessage != "" && (
        <Alert variant="destructive">
          <AlertTitle>Error Summary</AlertTitle>
          <AlertDescription>{alertMessage}</AlertDescription>
        </Alert>
      )}
      <div className="relative" ref={containerRef}>
        <canvas
          ref={canvasRef}
          width={settings.dimensions.width}
          height={settings.dimensions.height}
          onClick={handleCanvasClick}
          className="border border-gray-300 rounded-lg cursor-pointer"
        />

        <div
          style={{
            position: "absolute",
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transform: "translate(10px, -50%)",
          }}
        >
          <PopupDetails
            point={selectedPoint}
            settings={settings}
            surveyPointActions={surveyPointActions}
            onClose={closePopup}
          />
        </div>

        <Toaster />
        {isToastOpen && (
          <NewToast
            onClose={() => setIsToastOpen(false)}
            toastIsReady={handleToastIsReady}
          />
        )}
        {/* COMMENT THIS BUTTON OUT FOR PRODUCTION */}
        <button
          className="mt-2 px-2 py-1 bg-blue-500 text-white rounded"
          onClick={startTestPoints}
          disabled={idx !== null}
        >
          Add test points...
        </button>
      </div>
    </div>
  );
}
