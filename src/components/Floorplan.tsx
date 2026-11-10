"use client";
import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ChartArea,
  FlaskConical,
  Footprints,
  MousePointerClick,
  Router,
} from "lucide-react";

import { useSettings } from "./GlobalSettings";
import { useAppStatus } from "@/hooks/useAppStatus";
import { useMacosHelper } from "@/hooks/useMacosHelper";
import { LocationBanner } from "@/components/MacosHelperNotice";
import MeasurementPanel from "@/components/MeasurementPanel";
import PopupDetails from "@/components/PopupDetails";
import AccessPointDetails from "@/components/AccessPointDetails";
import { ZoomPanViewport } from "@/components/ZoomPanViewport";
import { Button } from "@/components/ui/button";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";
import {
  getDefaultWifiResults,
  getDefaultIperfResults,
  iperfTestResult,
  percentageToRssi,
} from "@/lib/utils";
import { AccessPoint, Gradient, SurveyPoint } from "@/lib/types";
import {
  accessPointName,
  drawAccessPointMarker,
  newAccessPoint,
} from "@/lib/access-points";
import { useMeasurement } from "@/hooks/useMeasurement";
import { useZoomPan } from "@/hooks/useZoomPan";
import { cn } from "@/lib/utils";

type XY = { x: number; y: number };
type MarkerSizes = ReturnType<typeof markerSizes>;

/** What is selected on the plan: a measurement or an access point marker. */
type Selected = { kind: "point" | "ap"; id: string };

/** An access point marker being dragged, in image coords. */
type ApDrag = {
  id: string;
  pointerId: number;
  /** where the press started, in CSS px */
  startX: number;
  startY: number;
  /** marker centre minus the press, so it doesn't jump under the cursor */
  dx: number;
  dy: number;
  /** null until it has moved past the click threshold */
  at: XY | null;
};

/** Movement (CSS px) after which pressing a marker drags it (useZoomPan's). */
const AP_DRAG_THRESHOLD = { mouse: 4, touch: 8 };

/** An access point marker's width, from the measurement dot's radius. */
const apSize = (sizes: MarkerSizes) => sizes.R * 2.8;

/**
 * Marker sizes in image pixels. At fit they grow with the image so dots are
 * never tiny on big plans, and never shrink below a readable size on screen
 * (`fit` is CSS px per image px with the whole plan in view). Zooming in
 * keeps the size they have on screen at fit, so they stay readable without
 * covering more of the plan.
 */
function markerSizes(imageWidth: number, fit: number, zoom: number) {
  const s = fit > 0 ? fit : 1;
  const z = zoom > 0 ? zoom : 1;
  const R = Math.max(7, 0.008 * imageWidth, 9 / s) / z;
  return {
    R,
    font: Math.max(11, 0.012 * imageWidth, 11 / s) / z,
    labelOffset: R * 1.9,
    pad: Math.max(2, 0.004 * imageWidth, 2.5 / s) / z,
  };
}

/** Draw one point's marker and label on the floor plan canvas. */
function drawPoint(
  ctx: CanvasRenderingContext2D,
  point: SurveyPoint,
  sizes: MarkerSizes,
  selected: boolean,
  gradient: Gradient,
) {
  const { R, font, labelOffset, pad } = sizes;
  const wifi = point.wifiData;
  if (!wifi) return;

  ctx.save();
  // marker
  ctx.beginPath();
  ctx.arc(point.x, point.y, R, 0, Math.PI * 2);
  ctx.fillStyle = point.isEnabled
    ? objectToRGBAString({
        ...getColorAt(wifi.signalStrength / 100, gradient),
        a: 1,
      })
    : "rgba(160, 165, 175, 0.9)";
  ctx.fill();
  ctx.lineWidth = R * 0.18;
  ctx.strokeStyle = "rgba(20, 24, 33, 0.65)";
  if (!point.isEnabled) ctx.setLineDash([R * 0.6, R * 0.5]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (selected) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, R * 1.5, 0, Math.PI * 2);
    ctx.lineWidth = R * 0.25;
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
}

type LoadedImage = {
  path: string;
  img: HTMLImageElement | null;
  error: string | null;
};

export default function ClickableFloorplan() {
  const {
    settings,
    updateSettings,
    surveyPointActions,
    loading,
    reloadSettings,
  } = useSettings();
  const status = useAppStatus();
  // macOS: the Wi-Fi helper needs Location access to see network names.
  // Ask here, before the first click, not only in Settings.
  const macHelper = useMacosHelper(
    !!status &&
      status.platform === "darwin" &&
      !status.mockMode &&
      !!status.macosHelper,
  );

  // The image and the selected point belong to one floor plan: a new path
  // shows neither until its own image has loaded.
  const path = settings.floorplanImagePath;
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const image = loaded?.path === path ? loaded.img : null;
  const imageError = loaded?.path === path ? loaded.error : null;
  const [selection, setSelection] = useState<
    (Selected & { path: string }) | null
  >(null);
  const selected: Selected | null = selection?.path === path ? selection : null;
  const select = (next: Selected | null) =>
    setSelection(next === null ? null : { ...next, path });
  const selectedId = selected?.kind === "point" ? selected.id : null;
  const selectedPoint =
    settings.surveyPoints.find((p) => p.id === selectedId) ?? null;
  const accessPoints = settings.accessPoints;
  const selectedAp =
    (selected?.kind === "ap" &&
      accessPoints.find((ap) => ap.id === selected.id)) ||
    null;
  // the next click on the plan places an access point (for this plan)
  const [placingOn, setPlacingOn] = useState<string | null>(null);
  const placing = placingOn !== null && placingOn === path;
  const [apDrag, setApDrag] = useState<ApDrag | null>(null);
  // a marker was just dragged: the click that follows is not a click
  const swallowClick = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Zoom and pan; back to fit for another floor plan. The frame fits the
  // width and the window's height below the header, the survey bar and
  // the title (about 250 px), so the whole plan is in view without scrolling.
  const zp = useZoomPan({
    image: image
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : null,
    resetKey: path,
    maxHeight: (h) => Math.max(240, h - 250),
  });
  const { frame, scale, offsetX, offsetY, fit, zoom } = zp;
  const imageWidth = image?.naturalWidth ?? 0;
  const [hovering, setHovering] = useState<"point" | "ap" | null>(null);

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

  // Effect events: they read the latest settings, but only a new floor plan
  // path loads an image. The survey gets the image's real size if it differs.
  const imageLoaded = useEffectEvent((src: string, img: HTMLImageElement) => {
    setLoaded({ path: src, img, error: null });
    if (
      img.naturalWidth !== settings.dimensions.width ||
      img.naturalHeight !== settings.dimensions.height
    ) {
      updateSettings({
        dimensions: { width: img.naturalWidth, height: img.naturalHeight },
      });
    }
  });
  const imageFailed = useEffectEvent((src: string) =>
    setLoaded({
      path: src,
      img: null,
      error: `The floor plan "${settings.floorplanImageName}" could not be loaded. Pick another one at the top of the page.`,
    }),
  );

  useEffect(() => {
    if (!path) return;
    const img = new Image();
    img.onload = () => imageLoaded(path, img);
    img.onerror = () => imageFailed(path);
    img.src = path;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [path]);

  /* ---------- drawing ---------- */

  const selectedApId = selectedAp?.id ?? null;

  // The canvas is the frame, i.e. what is on screen, drawn at the device
  // pixel ratio for the current zoom and pan. Markers and labels stay sharp
  // at any zoom (the image itself is as sharp as its own pixels allow), and
  // the cost doesn't grow with the zoom or the image's size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(frame.width * dpr);
    canvas.height = Math.round(frame.height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      dpr * scale,
      0,
      0,
      dpr * scale,
      dpr * offsetX,
      dpr * offsetY,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0);
    const sizes = markerSizes(image.naturalWidth, fit, zoom);
    for (const p of settings.surveyPoints) {
      drawPoint(ctx, p, sizes, p.id === selectedId, settings.gradient);
    }
    // access points on top: there are few, and they are what you look for
    for (const ap of settings.accessPoints) {
      const at = apDrag?.id === ap.id && apDrag.at ? apDrag.at : ap;
      drawAccessPointMarker(ctx, at.x, at.y, apSize(sizes), {
        label: accessPointName(ap),
        font: sizes.font,
        selected: selectedApId === ap.id,
      });
    }
  }, [
    image,
    settings.surveyPoints,
    settings.accessPoints,
    apDrag,
    selectedApId,
    frame.width,
    frame.height,
    scale,
    offsetX,
    offsetY,
    fit,
    zoom,
    selectedId,
    settings.gradient,
  ]);

  /* ---------- hit testing ---------- */

  const toImageCoords = (e: React.MouseEvent<HTMLCanvasElement>): XY => {
    const rect = e.currentTarget.getBoundingClientRect();
    return zp.toImage({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  /** The access point marker under `pt`, if any (they are drawn on top). */
  const hitTestAp = (pt: XY): AccessPoint | undefined => {
    const half = apSize(markerSizes(imageWidth, fit, zoom)) / 2;
    const tolerance = Math.max(half * 1.15, 14 / scale);
    let best: AccessPoint | undefined;
    let bestD = Infinity;
    for (const ap of accessPoints) {
      const d = Math.max(Math.abs(ap.x - pt.x), Math.abs(ap.y - pt.y));
      if (d < tolerance && d < bestD) {
        best = ap;
        bestD = d;
      }
    }
    return best;
  };

  const hitTest = (pt: XY): SurveyPoint | undefined => {
    const { R } = markerSizes(imageWidth, fit, zoom);
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

  const onPlan = (pt: XY) =>
    !!image &&
    pt.x >= 0 &&
    pt.y >= 0 &&
    pt.x <= image.naturalWidth &&
    pt.y <= image.naturalHeight;

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image) return;
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    const pt = toImageCoords(e);
    if (placing) {
      if (!onPlan(pt)) return;
      const ap = newAccessPoint(accessPoints, pt.x, pt.y);
      updateSettings((prev) => ({
        accessPoints: [...prev.accessPoints, ap],
      }));
      setPlacingOn(null);
      select({ kind: "ap", id: ap.id });
      return;
    }
    const ap = hitTestAp(pt);
    if (ap) {
      select(selectedAp?.id === ap.id ? null : { kind: "ap", id: ap.id });
      return;
    }
    const hit = hitTest(pt);
    if (hit) {
      select(selectedId === hit.id ? null : { kind: "point", id: hit.id });
      return;
    }
    if (selectedPoint || selectedAp) {
      select(null); // click away closes the details
      return;
    }
    if (measuring) return; // one at a time
    if (!onPlan(pt)) return;
    const x = Math.round(pt.x);
    const y = Math.round(pt.y);
    void measurement.start(x, y, measureOptions(settings.sudoerPassword));
  };

  /* ---------- access points ---------- */

  const changeAccessPoint = (
    id: string,
    patch: Partial<Omit<AccessPoint, "id">>,
  ) =>
    updateSettings((prev) => ({
      accessPoints: prev.accessPoints.map((ap) =>
        ap.id === id ? { ...ap, ...patch } : ap,
      ),
    }));

  const removeAccessPoint = (id: string) => {
    updateSettings((prev) => ({
      accessPoints: prev.accessPoints.filter((ap) => ap.id !== id),
    }));
    select(null);
  };

  // Pressing a marker drags it instead of panning the plan
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // a click only follows the press it belongs to
    swallowClick.current = false;
    if (!image || placing || apDrag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const pt = toImageCoords(e);
    const ap = hitTestAp(pt);
    if (!ap) return; // the viewport pans
    e.stopPropagation();
    setApDrag({
      id: ap.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: ap.x - pt.x,
      dy: ap.y - pt.y,
      at: null,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (apDrag && apDrag.pointerId === e.pointerId) {
      e.stopPropagation();
      if (!apDrag.at) {
        const threshold =
          e.pointerType === "mouse"
            ? AP_DRAG_THRESHOLD.mouse
            : AP_DRAG_THRESHOLD.touch;
        const moved = Math.hypot(
          e.clientX - apDrag.startX,
          e.clientY - apDrag.startY,
        );
        if (moved < threshold) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      const pt = toImageCoords(e);
      setApDrag({
        ...apDrag,
        at: {
          x: Math.min(imageWidth, Math.max(0, Math.round(pt.x + apDrag.dx))),
          y: Math.min(
            image?.naturalHeight ?? 0,
            Math.max(0, Math.round(pt.y + apDrag.dy)),
          ),
        },
      });
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!apDrag || apDrag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (apDrag.at) {
      swallowClick.current = true;
      if (e.type === "pointerup") changeAccessPoint(apDrag.id, apDrag.at);
    }
    setApDrag(null);
  };

  // Escape stops placing an access point
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacingOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing]);

  const measureOptions = (sudoerPassword: string) => ({
    measureSpeed: settings.measureSpeed,
    iperfServerAdrs: settings.iperfServerAdrs,
    testDuration: settings.testDuration,
    udpTests: settings.udpTests,
    sudoerPassword,
    iperfCommands: settings.iperfCommands,
  });

  /** The measurement asked for the sudo password: keep it, measure again. */
  const retryWithPassword = (password: string) => {
    const job = measurement.job;
    if (!job) return;
    updateSettings({ sudoerPassword: password });
    void measurement.start(job.x, job.y, measureOptions(password));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || placing) return;
    const pt = toImageCoords(e);
    setHovering(hitTestAp(pt) ? "ap" : hitTest(pt) ? "point" : null);
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
        // TCP only: the UDP tests stay null (not measured)
        const q = strength / 100;
        const iperfData = {
          ...getDefaultIperfResults(),
          tcpDownload: iperfTestResult(Math.round(900e6 * q * q)),
          tcpUpload: iperfTestResult(Math.round(700e6 * q * q)),
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

  const popupStyle = ((): React.CSSProperties => {
    const anchor = selectedAp ?? selectedPoint;
    if (!anchor) return {};
    // next to the point; at the frame's edge when it is panned out of view
    const cw = frame.width;
    const ch = frame.height;
    const at = zp.toFrame(anchor);
    const px = Math.min(cw, Math.max(0, at.x));
    const py = Math.min(ch, Math.max(0, at.y));
    const POPUP_W = 288; // w-72
    const GAP = 14;
    const flipX = px + GAP + POPUP_W > cw && px - GAP - POPUP_W >= 0;
    const top = Math.min(Math.max(8, py - 40), Math.max(8, ch - 260));
    return {
      left: flipX ? px - GAP - POPUP_W : px + GAP,
      top,
    };
  })();

  /* ---------- render ---------- */

  const points = settings.surveyPoints;
  const dot = pending ? zp.toFrame(pending) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Floor plan</h1>
          <p className="text-sm text-muted-foreground">
            Stand where you want to measure, then click that spot on the plan.
            Click a dot to see its details. Drag to move around a zoomed plan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            variant={placing ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              select(null);
              setPlacingOn(placing ? null : path);
            }}
            disabled={!image}
            aria-pressed={placing}
            data-testid="add-access-point"
            title="Mark where a router or access point is. It does not change the heat maps."
          >
            <Router className="h-3.5 w-3.5" />
            {placing ? "Cancel" : "Add access point"}
          </Button>
        </div>
      </div>

      {macHelper.helper && (
        <LocationBanner
          helper={macHelper.helper}
          asking={macHelper.asking}
          error={macHelper.error}
          onAuthorize={macHelper.authorize}
        />
      )}

      {imageError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {imageError}
        </div>
      )}

      <div className="survey-plate relative rounded-lg border p-3 sm:p-5">
        {image && placing && <PlacingHint />}
        {image && !measuring && !placing && (
          <NextStepHint points={points.length} />
        )}

        {!image && !imageError && (
          <div className="flex aspect-2/1 items-center justify-center text-sm text-muted-foreground">
            {loading ? "Loading survey" : "Loading floor plan"}
          </div>
        )}

        <ZoomPanViewport
          zp={zp}
          label="Floor plan"
          testId="floorplan-viewport"
          className="rounded-md bg-white shadow-xs"
          overlay={
            (selectedPoint || selectedAp) && (
              <div className="absolute z-20" style={popupStyle}>
                {selectedAp ? (
                  <AccessPointDetails
                    key={selectedAp.id}
                    ap={selectedAp}
                    onChange={(patch) =>
                      changeAccessPoint(selectedAp.id, patch)
                    }
                    onDelete={() => removeAccessPoint(selectedAp.id)}
                    onClose={() => select(null)}
                  />
                ) : (
                  <PopupDetails
                    point={selectedPoint}
                    settings={settings}
                    surveyPointActions={surveyPointActions}
                    onClose={() => select(null)}
                  />
                )}
              </div>
            )
          }
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            data-testid="floorplan-canvas"
            data-placing={placing ? "true" : undefined}
            className={cn(
              "absolute inset-0 block h-full w-full",
              !image && "hidden",
              zp.dragging || apDrag?.at
                ? "cursor-grabbing"
                : placing
                  ? "cursor-crosshair"
                  : hovering === "ap"
                    ? "cursor-grab"
                    : hovering === "point"
                      ? "cursor-pointer"
                      : measuring
                        ? "cursor-progress"
                        : "cursor-crosshair",
            )}
          />

          {dot && (
            <span
              aria-hidden="true"
              className="measuring-dot pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand"
              style={{ left: dot.x, top: dot.y }}
            />
          )}
        </ZoomPanViewport>
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
          onRetryWithPassword={retryWithPassword}
        />
      )}
    </div>
  );
}

/** Shown while the next click places an access point. */
function PlacingHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-4">
      <div
        className="flex items-center gap-2 rounded-full border bg-popover/95 px-3.5 py-1.5 text-sm shadow-float"
        data-testid="placing-access-point-hint"
      >
        <Router className="h-4 w-4 shrink-0 text-brand" />
        Click where the access point is. Esc cancels.
      </div>
    </div>
  );
}

/** Enough points for a heat map worth looking at; the hints stop here. */
const ENOUGH_POINTS = 12;

/**
 * What to do next, on the plan itself: the first click, then the next
 * room, then the heat maps. It follows the survey, so there is nothing to
 * dismiss, and a survey that already has points skips the early steps.
 */
function NextStepHint({ points }: { points: number }) {
  if (points >= ENOUGH_POINTS) return null;
  const [Icon, text] =
    points === 0
      ? [
          MousePointerClick,
          "Click where you are standing to take the first measurement",
        ]
      : points < 3
        ? [Footprints, "Now walk to another room and click where you are"]
        : [
            ChartArea,
            `${points} spots so far. A dozen or so, spread over the plan, make a good map.`,
          ];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-4">
      <div
        className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border bg-popover/95 px-3.5 py-1.5 text-sm shadow-float"
        data-testid="next-step-hint"
        data-step={points === 0 ? 1 : points < 3 ? 2 : 3}
      >
        <Icon className="h-4 w-4 shrink-0 text-brand" />
        {text}
        {points >= 3 && (
          <a
            href="#heatmaps"
            className="prose-link pointer-events-auto font-medium"
            data-testid="next-step-heatmaps"
          >
            See the heat map
          </a>
        )}
      </div>
    </div>
  );
}
