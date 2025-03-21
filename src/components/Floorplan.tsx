import React, { ReactNode, useRef, useState } from "react";
import { useEffect } from "react";
import { rssiToPercentage } from "../lib/utils";
import { useSettings } from "./GlobalSettings";
import { SurveyPoint, RGB, Gradient } from "../lib/types";
import { Loader } from "@/components/Loader";
import { startSurvey } from "@/lib/actions";
import { useToast } from "@/components/ui/use-toast";
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
  const [dimensions, setDimensions] = useState(settings.dimensions);
  const [scale, setScale] = useState(1);
  const [alertMessage, setAlertMessage] = useState("");
  // const dimensions = { width: 0, height: 0 };
  const { toast } = useToast();
  const [isToastOpen, setIsToastOpen] = useState(false);

  let measurementStatus = "";

  /**
   * Load the image (and the canvas) when the component is mounted
   */

  useEffect(() => {
    if (settings.floorplanImagePath != "") {
      const img = new Image();
      img.onload = () => {
        const newDimensions = { width: img.width, height: img.height };
        updateSettings({ dimensions: newDimensions });
        setImageLoaded(true);
        imageRef.current = img;
      };
      img.src = settings.floorplanImagePath; // load the image from the path
    }
  }, [settings.floorplanImagePath, setDimensions]);

  useEffect(() => {
    if (imageLoaded && canvasRef.current) {
      const canvas = canvasRef.current;
      const containerWidth = containerRef.current?.clientWidth || canvas.width;
      const scaleX = containerWidth / dimensions.width;
      setScale(scaleX);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      drawCanvas();
    }
  }, [imageLoaded, dimensions, settings.surveyPoints]);

  useEffect(() => {
    if (imageLoaded && canvasRef.current) {
      const canvas = canvasRef.current;
      const containerWidth = containerRef.current?.clientWidth || canvas.width;
      const scaleX = containerWidth / dimensions.width;
      setScale(scaleX);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      drawCanvas();
    }
  }, []);
  /**
   * pseudoMeasure - start the fake measurement process
   */

  const pseudoMeasure = async () => {
    await fetch("/api/start-task?action=start", { method: "POST" });
    setIsToastOpen(true);
  };

  /**
   * measureSurveyPoint - make measurements for point at x/y
   * Triggered by a click on the canvas that _isn't_ an existin
   *    surveypoint
   * @param x
   * @param y
   * @returns
   */
  const measureSurveyPoint = async (x: number, y: number) => {
    setAlertMessage("");
    measurementStatus = "running";
    if (!settings?.iperfServerAdrs) {
      setAlertMessage("Please set iperf server address");
      measurementStatus = "error";
      toast({
        title: "An error occurred",
        description: "Please set iperf server address",
        variant: "destructive",
      });
      return;
    }

    const runningPlatform = process.platform;

    if (
      runningPlatform == "darwin" &&
      (!settings.sudoerPassword || settings.sudoerPassword == "")
    ) {
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
      measurementStatus = "error";
      return;
    }

    toast({
      title: "Starting measurement...",
      description: "Please wait...",
    });
    try {
      const newPoint = await startSurvey(x, y, settings);

      surveyPointActions.add(newPoint);
      // const newPoints = [...settings.surveyPoints, newPoint];
      // // console.log("Floorplan new point: " + JSON.stringify(newPoint));
      // updateSettings({ surveyPoints: newPoints });
    } catch (error) {
      setAlertMessage(`An error occurred: ${error}`);
      measurementStatus = "error";
      toast({
        title: "An error occurred",
        description: "Something went wrong, please check the logs",
        variant: "destructive",
      });
      return;
    }
    measurementStatus = "ready";
    toast({
      title: "Measurement complete",
      description: "Measurement complete",
    });
  };

  /**
   * drawCanvas - make the entire drawing go...
   */
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && imageRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageRef.current, 0, 0);

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

    if (!match) return null; // Invalid input

    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1, // Default alpha to 1 if missing
    };
  }

  // Example Usage:
  // const rgbaString = "rgba(255, 100, 50, 0.5)";
  // const result = rgbaToObject(rgbaString);
  // console.log(result); // { r: 255, g: 100, b: 50, a: 0.5 }

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
    // const i = index;
    // Create a gradient for the point
    // const gradient = ctx.createRadialGradient(
    //   point.x,
    //   point.y,
    //   0,
    //   point.x,
    //   point.y,
    //   8,
    // );
    // gradient.addColorStop(
    //   0,
    //   point.isDisabled
    //     ? "rgba(156, 163, 175, 0.9)"
    //     : "rgba(59, 130, 246, 0.9)",
    // );
    // gradient.addColorStop(
    //   1,
    //   point.isDisabled
    //     ? "rgba(75, 85, 99, 0.9)"
    //     : "rgba(37, 99, 235, 0.9)",
    // );
    // Enhanced pulsing effect
    // const pulseMaxSize = 20; // Increased from 8
    // const pulseMinSize = 10; // New minimum size
    // const pulseSize =
    //   pulseMinSize +
    //   ((Math.sin(Date.now() * 0.001 + index) + 1) / 2) *
    //     (pulseMaxSize - pulseMinSize);

    // Draw outer pulse
    // ctx.beginPath();
    // ctx.arc(point.x, point.y, pulseSize, 0, 2 * Math.PI);
    // ctx.fillStyle = point.isDisabled
    //   ? `rgba(75, 85, 99, ${0.4 - ((pulseSize - pulseMinSize) / (pulseMaxSize - pulseMinSize)) * 0.3})`
    //   : `rgba(59, 130, 246, ${0.4 - ((pulseSize - pulseMinSize) / (pulseMaxSize - pulseMinSize)) * 0.3})`;
    // ctx.fill();

    // canvas = canvasRef.current;
    // if (!canvas) {
    //   console.log(`canvas is null`);
    //   return;
    // }
    // ctx = canvas.getContext("2d");

    if (point.wifiData) {
      // console.log(
      //   `drawPoint: ${JSON.stringify(point)} ${JSON.stringify(ctx)} `,
      // );
      const wifiInfo = point.wifiData;
      // const iperfInfo = point.iperfResults;
      // const frequencyBand = wifiInfo.channel > 14 ? "5GHz" : "2.4GHz";
      // const apLabel =
      //   apMapping.find((ap) => ap.macAddress === wifiInfo.bssid)
      //     ?.apName ?? wifiInfo.bssid + " " + wifiInfo.rssi;
      // const annotation = `${frequencyBand}\n${apLabel}`;
      // ctx.fillStyle = "blue"; // Set fill color
      // ctx.fillRect(50, 50, 100, 75); // Draw a filled rectangle (x, y, width, height)

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

      const annotation = `${rssiToPercentage(wifiInfo.rssi)}%`;
      // These are no longer displayed
      // annotation += ` (${wifiInfo.rssi}dBm`;
      // annotation += ` ${frequencyBand})`;
      // annotation += `\n`;
      // annotation += `${megabits(iperfInfo.tcpDownload.bitsPerSecond)} / `;
      // annotation += `${megabits(iperfInfo.tcpUpload.bitsPerSecond)} `;
      // annotation += `Mbps`;
      // annotation += `\n${t}`;
      // annotation += `${megabits(iperfInfo.udpDownload.bitsPerSecond)} / `;
      // annotation += `${megabits(iperfInfo.udpUpload.bitsPerSecond)} `;

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

      // gradient.addColorStop(
      //   0,
      //   point.isDisabled
      //     ? "rgba(156, 163, 175, 0.9)"
      //     : getGradientColor(rssiToPercentage(wifiInfo.rssi)),
      // );

      // // Re-draw the main point
      // ctx.beginPath();
      // ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
      // ctx.fillStyle = gradient;
      // ctx.fill();

      lines.forEach((line, index) => {
        ctx.fillText(
          line,
          point.x,
          point.y + 15 + padding + index * lineHeight,
        );
      });
    }
  };

  // Convert a number of bits (typically megabits) into a string
  // function megabits(value: number): string {
  //   return `${(value / 1000000).toFixed(0)}`;
  // }

  // Takes a percentage signal strength
  // returns a rgba() giving a color gradient between red (100%) and blue (0%)
  function getGradientColor(value: number): string {
    // Define key color points
    const colorStops: {
      value: number;
      color: [number, number, number, number];
    }[] = [
      { value: 100, color: [255, 0, 0, 1] }, // Red
      { value: 75, color: [255, 255, 0, 1] }, // Yellow
      { value: 50, color: [0, 255, 0, 1] }, // Green
      { value: 35, color: [0, 255, 255, 1] }, // Turquoise
      { value: 0, color: [0, 0, 255, 1] }, // Blue
      // Color experiment - Green is good, blue is OK, red and yellow are bad
      // the following values don't quite work...
      // { value: 100, color: [0, 255, 0, 1] }, // Green
      // { value: 75, color: [0, 255, 255, 1] }, // Turquoise
      // { value: 50, color: [0, 0, 255, 1] }, // Blue
      // { value: 45, color: [255, 255, 255, 1] }, // Grey
      // { value: 40, color: [255, 255, 0, 1] }, // Yellow
      // { value: 0, color: [255, 0, 0, 1] }, // Red
    ];

    // Handle out-of-range values
    value = Math.min(100, value);
    value = Math.max(0, value);

    // Find the two closest stops
    let lowerStop = colorStops[colorStops.length - 1];
    let upperStop = colorStops[0];

    for (let i = 0; i < colorStops.length - 1; i++) {
      if (value <= colorStops[i].value && value >= colorStops[i + 1].value) {
        lowerStop = colorStops[i + 1];
        upperStop = colorStops[i];
        break;
      }
    }

    // Normalize value to a range between 0 and 1
    const t = (value - lowerStop.value) / (upperStop.value - lowerStop.value);

    // Interpolate RGB values
    const r = Math.round(
      lowerStop.color[0] + t * (upperStop.color[0] - lowerStop.color[0]),
    );
    const g = Math.round(
      lowerStop.color[1] + t * (upperStop.color[1] - lowerStop.color[1]),
    );
    const b = Math.round(
      lowerStop.color[2] + t * (upperStop.color[2] - lowerStop.color[2]),
    );

    return `rgba(${r}, ${g}, ${b}, 1.0)`; // Always return full opacity
  }

  // Example usage
  // console.log(getGradientColor(100)); // [255, 0, 0, 1] (Red)
  // console.log(getGradientColor(75)); // [255, 255, 0, 1] (Yellow)
  // console.log(getGradientColor(50)); // [0, 255, 0, 1] (Green)
  // console.log(getGradientColor(-25)); // [0, 255, 255, 1] (Turquoise)
  // console.log(getGradientColor(0)); // [0, 0, 255, 1] (Blue)
  // console.log(getGradientColor(63)); // Interpolated color between Green and Yellow
  // console.log(getGradientColor(-10)); // Interpolated color between Turquoise and Blue

  // const drawCanvas = () => {
  //   const canvas = canvasRef.current;
  //   if (canvas && imageRef.current) {
  //     const ctx = canvas.getContext("2d");
  //     if (ctx) {
  //       ctx.clearRect(0, 0, canvas.width, canvas.height);
  //       ctx.drawImage(imageRef.current, 0, 0);

  //       drawPoints(ctx, settings.surveyPoints);
  //     }
  //   }
  // };

  // useEffect(() => {
  //   let animationFrameId: number;

  //   const animate = () => {
  //     drawCanvas();
  //     animationFrameId = requestAnimationFrame(animate);
  //   };

  //   animate();

  //   return () => {
  //     cancelAnimationFrame(animationFrameId);
  //   };
  // }, [settings.surveyPoints, dimensions, settings.apMapping]);

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

    // look for a surveyPoint that's "close enough" (10 units?) to the click
    // sets clickedPoint to that point or null (?)
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
      // no selected point - just start a measurement
      setSelectedPoint(null);
      // round the coordinates,
      // heatmap expects integer values
      measureSurveyPoint(Math.round(x), Math.round(y));
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
        <button
          onClick={() => pseudoMeasure()}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Start NewToast gizmo
        </button>
        <div className="space-y-2 flex flex-col">
          {settings.surveyPoints?.length > 0 && (
            <div>Total Measurements: {settings.surveyPoints.length}</div>
          )}
        </div>
      </div>
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{alertMessage}</AlertDescription>
      </Alert>
      <div className="relative" ref={containerRef}>
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg ${
            status === "running" ? "" : "hidden"
          }`}
        >
          <div className="flex flex-col items-center">
            <Loader className="w-24 h-24 text-blue-500" />
            <p className="text-white text-lg font-medium">Running...</p>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
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
        {isToastOpen && <NewToast onClose={() => setIsToastOpen(false)} />}
      </div>
    </div>
  );
}
