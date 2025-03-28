import React, { ReactNode, useRef, useState } from "react";
import { useEffect } from "react";
import { rssiToPercentage } from "../lib/utils";
import { useSettings } from "./GlobalSettings";
import { SurveyPoint, RGB, Gradient } from "../lib/types";
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
   * Load the image (and the canvas) when the component is mounted
   */
  useEffect(() => {
    if (settings.floorplanImagePath != "") {
      const img = new Image();
      img.src = settings.floorplanImagePath; // load the image from the path

      img.onload = () => {
        const newDimensions = { width: img.width, height: img.height };
        updateSettings({ dimensions: newDimensions });
        console.log(
          `useEffect for image ${JSON.stringify(settings.dimensions)}`,
        );
        setImageLoaded(true);
        imageRef.current = img;
      };
      img.onerror = () => {
        console.log(`image error`);
      };
    }
  }, []);

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

  /**
   * pseudoMeasure - start the fake measurement process
   */
  // const pseudoMeasure = async () => {
  //   // await setIsToastOpen(true);
  //   setIsToastOpen(true);
  //   // Tell the fake measurement process to begin
  //   await fetch("/api/start-task?action=start", { method: "POST" });
  // };

  const handleToastIsReady = (): void => {
    console.log(`handleToastIsReady called...`);
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

    console.log(`Checking Settings...`);
    const settingsErrorMessage = await checkSettings(settings);
    console.log(`settings check: ${settingsErrorMessage}`);
    if (settingsErrorMessage !== "") {
      setAlertMessage(settingsErrorMessage);
      return null;
    }

    try {
      let newPoint = await startSurvey(settings);
      // null is OK - it just means that measurement was cancelled
      if (!newPoint) {
        return;
      }
      // otherwise, add the point, bumping the point number
      const pointNum = settings.nextPointNum;
      newPoint = {
        ...newPoint,
        x,
        y,
        isEnabled: true,
        id: `Point_${pointNum}`,
      };
      updateSettings({ nextPointNum: pointNum + 1 });

      surveyPointActions.add(newPoint);
    } catch (error) {
      setAlertMessage(`An error occurred: ${error}`);
      return;
    }
  };

  /**
   * drawCanvas - make the entire drawing go...
   */
  const drawCanvas = () => {
    console.log(
      `drawCanvas()  ${JSON.stringify(imageRef.current)}`, // ${JSON.stringify(canvasRef.current)}
    );
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
    // console.log(JSON.stringify(points));
    points.forEach((point) => drawPoint(point, ctx));
  };

  /**
   * Converts a rgba to an {r, g, b, a} object.
   */
  function rgbaToObject(rgba: string): RGB {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);

    if (!match) return { r: 0, g: 0, b: 0, a: 1.0 }; // Invalid input - black

    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1, // Default alpha to 1 if missing
    };
  }

  /**
   * Interpolates between two RGBA colors.
   */
  function interpolateColor(color1: RGB, color2: RGB, factor: number): RGB {
    return {
      r: Math.round(color1.r + (color2.r - color1.r) * factor),
      g: Math.round(color1.g + (color2.g - color1.g) * factor),
      b: Math.round(color1.b + (color2.b - color1.b) * factor),
      a: color1.a + (color2.a - color1.a) * factor,
    };
  }

  /**
   * Returns the interpolated RGBA color for a given value (0-1) from a gradient.
   */
  function getColorAt(value: number, gradient: Gradient): string {
    // sort the keys to be in increasing order
    const keys = Object.keys(gradient)
      .map(Number)
      .sort((a, b) => a - b);

    // Constrain theValue to be 0..1
    const theValue = Math.min(1.0, Math.max(0.0, value));

    for (let i = 0; i < keys.length - 1; i++) {
      const lower = keys[i];
      const upper = keys[i + 1];

      if (theValue >= lower && theValue <= upper) {
        const factor = (theValue - lower) / (upper - lower);
        const color1 = rgbaToObject(gradient[lower]);
        const color2 = rgbaToObject(gradient[upper]);

        const interpolated = interpolateColor(color1, color2, factor);
        return `rgba(${interpolated.r}, ${interpolated.g}, ${interpolated.b}, ${interpolated.a.toFixed(2)})`;
      }
    }

    // Return the last gradient color if out of bounds
    const lastColor = rgbaToObject(gradient[keys[keys.length - 1]]);
    return `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, ${lastColor.a.toFixed(2)})`;
  }

  const drawPoint = (point: SurveyPoint, ctx: CanvasRenderingContext2D) => {
    if (point.wifiData) {
      // console.log(
      //   `drawPoint: ${JSON.stringify(point)} ${JSON.stringify(ctx)} `,
      // );
      const wifiInfo = point.wifiData;

      // Draw the main point
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = point.isEnabled
        ? getColorAt(rssiToPercentage(wifiInfo.rssi) / 100, settings.gradient)
        : "rgba(156, 163, 175, 0.9)";
      ctx.fill();

      // Draw a grey border
      ctx.strokeStyle = "grey";
      ctx.lineWidth = 2;
      ctx.closePath();
      ctx.stroke();
      // const t = getGradientColor(rssiToPercentage(wifiInfo.rssi));

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
      // start a measurement
      console.log(`starting a measurement`);
      setSelectedPoint(null);
      setAlertMessage("");
      setIsToastOpen(true);
      // measureSurveyPoint(Math.round(x), Math.round(y));
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
        {/* <button
          onClick={() => pseudoMeasure()}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Start NewToast gizmo
        </button> */}
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
        {/* <div
          className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg ${
            measurementStatus === "running" ? "" : "hidden"
          }`}
        >
          <div className="flex flex-col items-center">
            <Loader className="w-24 h-24 text-blue-500" />
            <p className="text-white text-lg font-medium">Running...</p>
          </div>
        </div> */}

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
      </div>
    </div>
  );
}
