"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FlaskConical, MousePointerClick } from "lucide-react";

import { useSettings } from "./GlobalSettings";
import { useAppStatus } from "@/hooks/useAppStatus";
import MeasurementPanel from "@/components/MeasurementPanel";
import PopupDetails from "@/components/PopupDetails";
import { Button } from "@/components/ui/button";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";
import {
  getDefaultWifiResults,
  getDefaultIperfResults,
  percentageToRssi,
} from "@/lib/utils";
import { SurveyPoint } from "@/lib/types";
import { useMeasurement } from "@/hooks/useMeasurement";
import { cn } from "@/lib/utils";

type XY = { x: number; y: number };

/**
 * Marker sizes in image pixels. They grow with the image so dots are never
 * tiny on big plans, and never shrink below a readable size on screen
 * (`scale` is CSS px per image px).
 */
function markerSizes(imageWidth: number, scale: number) {
  const s = scale > 0 ? scale : 1;
  const R = Math.max(7, 0.008 * imageWidth, 9 / s);
  return {
    R,
    font: Math.max(11, 0.012 * imageWidth, 11 / s),
    labelOffset: R * 1.9,
    pad: Math.max(2, 0.004 * imageWidth, 2.5 / s),
  };
}

export default function ClickableFloorplan() {
  const {
    settings,
    updateSettings,
    surveyPointActions,
    loading,
    reloadSettings,
  } = useSettings();
  const status = useAppStatus();

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [hoveringPoint, setHoveringPoint] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPoint = useMemo(
    () => settings.surveyPoints.find((p) => p.id === selectedId) ?? null,
    [settings.surveyPoints, selectedId],
  );

  // The server measures and saves the point; reload the survey to show it
  const measurement = useMeasurement(
    settings.floorplanImageName,
    reloadSettings,
  );
  const { measuring } = measurement;
  // the spot being measured on this plan, in image coords
  const pending: XY | null =
    measuring && measurement.job?.survey === settings.floorplanImageName
      ? measurement.job
      : null;

  /* ---------- image ---------- */

  useEffect(() => {
    setImage(null);
    setImageError(null);
    setSelectedId(null);
    if (!settings.floorplanImagePath) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      if (
        img.naturalWidth !== settings.dimensions.width ||
        img.naturalHeight !== settings.dimensions.height
      ) {
        updateSettings({
          dimensions: { width: img.naturalWidth, height: img.naturalHeight },
        });
      }
    };
    img.onerror = () =>
      setImageError(
        `The floor plan "${settings.floorplanImageName}" could not be loaded. Pick another one in Settings.`,
      );
    img.src = settings.floorplanImagePath;
    // dimensions are written by this effect, not read from settings
    // oxlint-disable-next-line react/exhaustive-deps
  }, [settings.floorplanImagePath]);

  /* ---------- scale to container ---------- */

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !image) return;
    const update = () => setScale(el.clientWidth / image.naturalWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [image]);

  /* ---------- drawing ---------- */

  const drawPoint = useCallback(
    (ctx: CanvasRenderingContext2D, point: SurveyPoint, W: number) => {
      const { R, font, labelOffset, pad } = markerSizes(W, scale);
      const wifi = point.wifiData;
      if (!wifi) return;
      const selected = point.id === selectedId;

      ctx.save();
      // marker
      ctx.beginPath();
      ctx.arc(point.x, point.y, R, 0, Math.PI * 2);
      ctx.fillStyle = point.isEnabled
        ? objectToRGBAString({
            ...getColorAt(wifi.signalStrength / 100, settings.gradient),
            a: 1,
          })
        : "rgba(160, 165, 175, 0.9)";
      ctx.fill();
      ctx.lineWidth = Math.max(1, R * 0.18);
      ctx.strokeStyle = "rgba(20, 24, 33, 0.65)";
      if (!point.isEnabled) ctx.setLineDash([R * 0.6, R * 0.5]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, R + Math.max(3, R * 0.5), 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, R * 0.25);
        ctx.strokeStyle = "hsl(252 56% 57%)";
        ctx.stroke();
      }

      // label
      const text = `${wifi.signalStrength}%`;
      ctx.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const w = ctx.measureText(text).width + pad * 2;
      const h = font * 1.25 + pad * 2;
      const x = point.x - w / 2;
      const y = point.y + labelOffset;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, pad);
      ctx.fill();
      ctx.fillStyle = point.isEnabled ? "#14181f" : "#6b7280";
      ctx.fillText(text, point.x, y + pad);
      ctx.restore();
    },
    [selectedId, settings.gradient, scale],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    for (const p of settings.surveyPoints) drawPoint(ctx, p, canvas.width);
  }, [image, settings.surveyPoints, drawPoint]);

  /* ---------- hit testing ---------- */

  const toImageCoords = (e: React.MouseEvent<HTMLCanvasElement>): XY => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const hitTest = (pt: XY): SurveyPoint | undefined => {
    const W = image?.naturalWidth ?? 0;
    const { R } = markerSizes(W, scale);
    // generous on touch screens: at least 14 CSS px
    const tolerance = Math.max(R * 1.6, 14 / scale);
    let best: SurveyPoint | undefined;
    let bestD = Infinity;
    for (const p of settings.surveyPoints) {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < tolerance && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  };

  /* ---------- interaction ---------- */

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const pt = toImageCoords(e);
    const hit = hitTest(pt);
    if (hit) {
      setSelectedId((cur) => (cur === hit.id ? null : hit.id));
      return;
    }
    if (selectedPoint) {
      setSelectedId(null); // click away closes the details
      return;
    }
    if (measuring) return; // one at a time
    void measurement.start(Math.round(pt.x), Math.round(pt.y), {
      measureSpeed: settings.measureSpeed,
      iperfServerAdrs: settings.iperfServerAdrs,
      testDuration: settings.testDuration,
      sudoerPassword: settings.sudoerPassword,
      iperfCommands: settings.iperfCommands,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image) return;
    setHoveringPoint(!!hitTest(toImageCoords(e)));
  };

  /* ---------- sample data (mock mode only) ---------- */

  const addSamplePoints = () => {
    const W = settings.dimensions.width;
    const H = settings.dimensions.height;
    const router = { x: W * 0.28, y: H * 0.32 };
    const maxD = Math.hypot(W, H) * 0.7;
    const cols = 6;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.round(W * (0.1 + (0.8 * c) / (cols - 1)));
        const y = Math.round(H * (0.12 + (0.76 * r) / (rows - 1)));
        const d = Math.hypot(x - router.x, y - router.y) / maxD;
        const strength = Math.round(
          Math.max(
            12,
            Math.min(100, 100 - d * 95 + ((r * 7 + c * 13) % 9) - 4),
          ),
        );
        const wifiData = {
          ...getDefaultWifiResults(),
          ssid: "Demo Network",
          bssid: "9e05d696e830",
          signalStrength: strength,
          rssi: percentageToRssi(strength),
          noise: -90 - ((r * 5 + c * 3) % 6), // -90..-95 dBm
          channel: 44,
          band: 5,
        };
        const iperfData = getDefaultIperfResults();
        const q = strength / 100;
        iperfData.tcpDownload = {
          ...iperfData.tcpDownload,
          bitsPerSecond: Math.round(900e6 * q * q),
        };
        iperfData.tcpUpload = {
          ...iperfData.tcpUpload,
          bitsPerSecond: Math.round(700e6 * q * q),
        };
        surveyPointActions.add({
          wifiData,
          iperfData,
          x,
          y,
          timestamp: Date.now(),
          isEnabled: true,
          id: "",
        });
      }
    }
  };

  /* ---------- popup placement ---------- */

  const popupStyle = useMemo((): React.CSSProperties => {
    if (!selectedPoint || !containerRef.current) return {};
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const px = selectedPoint.x * scale;
    const py = selectedPoint.y * scale;
    const POPUP_W = 288; // w-72
    const GAP = 14;
    const flipX = px + GAP + POPUP_W > cw;
    const top = Math.min(Math.max(8, py - 40), Math.max(8, ch - 260));
    return {
      left: flipX ? px - GAP - POPUP_W : px + GAP,
      top,
    };
  }, [selectedPoint, scale]);

  /* ---------- render ---------- */

  const points = settings.surveyPoints;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Floor plan</h1>
          <p className="text-sm text-muted-foreground">
            Stand where you want to measure, then click that spot on the plan.
            Click a dot to see its details.
          </p>
        </div>
        {status?.mockMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={addSamplePoints}
            disabled={!image || measuring}
            data-testid="add-sample-points"
            title="Mock mode only: fills the plan with synthetic points"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Add sample points
          </Button>
        )}
      </div>

      {imageError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {imageError}
        </div>
      )}

      <div className="survey-plate relative rounded-lg border p-3 sm:p-5">
        {points.length === 0 && image && !measuring && (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center">
            <div className="flex items-center gap-2 rounded-full border bg-popover/95 px-3.5 py-1.5 text-sm shadow-float">
              <MousePointerClick className="h-4 w-4 text-brand" />
              Click where you are standing to take the first measurement
            </div>
          </div>
        )}

        <div ref={containerRef} className="relative">
          {!image && !imageError && (
            <div className="flex aspect-[2/1] items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading survey" : "Loading floor plan"}
            </div>
          )}
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            data-testid="floorplan-canvas"
            className={cn(
              "block w-full rounded-md bg-white shadow-sm",
              !image && "hidden",
              hoveringPoint
                ? "cursor-pointer"
                : measuring
                  ? "cursor-progress"
                  : "cursor-crosshair",
            )}
          />

          {pending && (
            <span
              aria-hidden="true"
              className="measuring-dot pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand"
              style={{ left: pending.x * scale, top: pending.y * scale }}
            />
          )}

          {selectedPoint && (
            <div className="absolute z-20" style={popupStyle}>
              <PopupDetails
                point={selectedPoint}
                settings={settings}
                surveyPointActions={surveyPointActions}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      </div>

      {measurement.phase !== "idle" && (
        <MeasurementPanel
          phase={measurement.phase}
          header={measurement.header}
          fields={measurement.fields}
          warning={measurement.warning}
          message={measurement.message}
          onClose={measurement.dismiss}
          onCancel={measurement.cancel}
          measureSpeed={settings.measureSpeed}
        />
      )}
    </div>
  );
}
