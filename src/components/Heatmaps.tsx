"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useSettings } from "@/components/GlobalSettings";
import { calculateRadiusByBoundingBox } from "@/lib/radiusCalculations";
import {
  SurveyPoint,
  testProperties,
  MeasurementTestType,
  testTypes,
  IperfTestProperty,
} from "@/lib/types";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";
import { cn, metricFormatter } from "@/lib/utils";
import { getLogger } from "@/lib/logger";
import createHeatmapWebGLRenderer from "@/app/webGL/renderers/mainRenderer";

import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { HeatmapSlider } from "./Slider";
import HeatmapImage from "./HeatmapImage";
import HeatmapModal from "./HeatmapModal";

const logger = getLogger("Heatmaps");

const metricTitles: Record<MeasurementTestType, string> = {
  signalStrength: "Signal strength",
  tcpDownload: "TCP download",
  tcpUpload: "TCP upload",
  udpDownload: "UDP download",
  udpUpload: "UDP upload",
};

const propertyTitles: Record<keyof IperfTestProperty, string> = {
  bitsPerSecond: "Throughput (Mbps)",
  jitterMs: "Jitter (ms)",
  lostPackets: "Lost packets",
  retransmits: "Retransmits",
  packetsReceived: "Packets received",
  signalStrength: "Signal",
};

const propertyNotes: Partial<Record<keyof IperfTestProperty, string>> = {
  jitterMs: "UDP only",
  lostPackets: "UDP only",
  packetsReceived: "UDP only",
  retransmits: "TCP download only",
};

const getAvailableProperties = (
  metric: MeasurementTestType,
): (keyof IperfTestProperty)[] => {
  switch (metric) {
    case "tcpDownload":
      return ["bitsPerSecond", "retransmits"];
    case "tcpUpload":
      return ["bitsPerSecond"];
    case "udpDownload":
    case "udpUpload":
      return ["bitsPerSecond", "jitterMs", "lostPackets", "packetsReceived"];
    default:
      return [];
  }
};

type HeatmapKey = string; // "signalStrength" or "<metric>-<property>"
type Rendered = { src: string | null; count: number };

/**
 * Heatmaps - renders one heat map per selected metric/property
 * (WebGL inverse-distance weighting, see docs/Theory_of_Operation.md).
 */
export function Heatmaps() {
  const { settings, updateSettings } = useSettings();
  const points = settings.surveyPoints;
  const enabledPoints = useMemo(
    () => points.filter((p) => p.isEnabled),
    [points],
  );

  const [heatmaps, setHeatmaps] = useState<Record<HeatmapKey, Rendered>>({});
  const [rendering, setRendering] = useState(false);
  const [enlarged, setEnlarged] = useState<{ src: string; alt: string } | null>(
    null,
  );

  const [selectedMetrics, setSelectedMetrics] = useState<MeasurementTestType[]>(
    ["signalStrength"],
  );
  const [selectedProperties, setSelectedProperties] = useState<
    (keyof IperfTestProperty)[]
  >(["bitsPerSecond"]);
  const [asPercentage, setAsPercentage] = useState(true);

  const autoRadius = Math.round(calculateRadiusByBoundingBox(enabledPoints));
  const radius = settings.radiusDivider ?? autoRadius;

  /* ---------- data ---------- */

  const getMetricValue = useCallback(
    (
      point: SurveyPoint,
      metric: MeasurementTestType,
      property?: keyof IperfTestProperty,
    ): number | null => {
      if (metric === "signalStrength") {
        // the map is always drawn in %, the legend may show dBm
        return point.wifiData.signalStrength;
      }
      const test = point.iperfData?.[metric];
      if (!test || test.bitsPerSecond === 0) return null; // test not run
      const v = property ? test[property] : test.bitsPerSecond;
      return typeof v === "number" ? v : null;
    },
    [],
  );

  const generateHeatmapData = useCallback(
    (metric: MeasurementTestType, property?: keyof IperfTestProperty) =>
      enabledPoints
        .map((p) => {
          const value = getMetricValue(p, metric, property);
          return value === null ? null : { x: p.x, y: p.y, value };
        })
        .filter(
          (v): v is { x: number; y: number; value: number } => v !== null,
        ),
    [enabledPoints, getMetricValue],
  );

  /* ---------- drawing ---------- */

  const drawLegend = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      barWidth: number,
      height: number,
      min: number,
      max: number,
      metric: MeasurementTestType,
      property: keyof IperfTestProperty,
      fontPx: number,
    ) => {
      for (let i = 0; i < height; i++) {
        const normalized = (height - i) / height;
        ctx.fillStyle = objectToRGBAString({
          ...getColorAt(normalized, settings.gradient),
          a: 1,
        });
        ctx.fillRect(x, y + i, barWidth, 1);
      }
      ctx.strokeStyle = "rgba(20,24,33,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, barWidth - 1, height - 1);

      const ticks = 5;
      ctx.fillStyle = "#14181f";
      ctx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= ticks; i++) {
        const ty = y + (height * i) / ticks;
        const value = max - ((max - min) * i) / ticks;
        ctx.beginPath();
        ctx.moveTo(x + barWidth, ty);
        ctx.lineTo(x + barWidth + fontPx * 0.5, ty);
        ctx.strokeStyle = "rgba(20,24,33,0.6)";
        ctx.stroke();
        ctx.fillText(
          metricFormatter(value, metric, property, asPercentage),
          x + barWidth + fontPx * 0.8,
          ty,
        );
      }
    },
    [settings.gradient, asPercentage],
  );

  const renderHeatmap = useCallback(
    async (
      metric: MeasurementTestType,
      property: keyof IperfTestProperty,
    ): Promise<Rendered> => {
      const W = settings.dimensions.width;
      const H = settings.dimensions.height;
      if (W <= 1 || H <= 1) return { src: null, count: 0 };

      const data = generateHeatmapData(metric, property);
      if (metric !== "signalStrength" && data.length === 0) {
        return { src: null, count: 0 };
      }

      // legend + caption sized relative to the plan
      const fontPx = Math.max(13, Math.round(Math.min(W, H) * 0.022));
      const legendBar = Math.round(fontPx * 1.8);
      const legendWidth = legendBar + fontPx * 7;
      const margin = Math.round(fontPx * 1.2);
      const captionH = Math.round(fontPx * 2.2);

      const out = document.createElement("canvas");
      out.width = W + margin * 2 + legendWidth;
      out.height = H + margin * 2 + captionH;
      const ctx = out.getContext("2d");
      if (!ctx) {
        logger.error("Failed to get 2D context");
        return { src: null, count: 0 };
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);

      // Signal is always 0..100 % (people deserve to know when it is low);
      // throughput and the rest run from 0 to the best value measured,
      // which is how the shader normalizes colours.
      let min = 0;
      let max = 1;
      if (metric === "signalStrength") {
        min = asPercentage ? 0 : -100;
        max = asPercentage ? 100 : -40;
      } else {
        max = Math.max(1e-9, ...data.map((d) => d.value));
      }

      const glCanvas = document.createElement("canvas");
      glCanvas.width = W;
      glCanvas.height = H;
      try {
        const renderer = createHeatmapWebGLRenderer(
          glCanvas,
          data,
          settings.gradient,
        );
        await renderer.render({
          points: data,
          influenceRadius: radius,
          maxOpacity: settings.maxOpacity,
          minOpacity: settings.minOpacity,
          backgroundImageSrc: settings.floorplanImagePath,
          width: W,
          height: H,
        });
      } catch (err) {
        logger.error(`WebGL render failed: ${err}`);
        return { src: null, count: data.length };
      }
      ctx.drawImage(glCanvas, margin, margin);
      ctx.strokeStyle = "rgba(20,24,33,0.15)";
      ctx.strokeRect(margin + 0.5, margin + 0.5, W - 1, H - 1);

      drawLegend(
        ctx,
        margin + W + margin,
        margin,
        legendBar,
        H,
        min,
        max,
        metric,
        property,
        fontPx,
      );

      // caption so a downloaded image explains itself
      const title =
        metric === "signalStrength"
          ? `Signal strength (${asPercentage ? "%" : "dBm"})`
          : `${metricTitles[metric]}, ${propertyTitles[property].toLowerCase()}`;
      ctx.fillStyle = "#14181f";
      ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(title, margin, margin + H + captionH / 2 + margin / 2);
      ctx.fillStyle = "#6b7280";
      ctx.font = `${fontPx * 0.85}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "right";
      const when = data.length
        ? new Date(
            Math.max(...enabledPoints.map((p) => p.timestamp)),
          ).toLocaleDateString()
        : "";
      ctx.fillText(
        `${settings.floorplanImageName}   ${data.length} point${data.length === 1 ? "" : "s"}   ${when}`,
        margin + W,
        margin + H + captionH / 2 + margin / 2,
      );

      return { src: out.toDataURL(), count: data.length };
    },
    [
      settings.dimensions,
      settings.gradient,
      settings.maxOpacity,
      settings.minOpacity,
      settings.floorplanImagePath,
      settings.floorplanImageName,
      generateHeatmapData,
      drawLegend,
      radius,
      asPercentage,
      enabledPoints,
    ],
  );

  const wanted = useMemo(() => {
    const list: {
      key: HeatmapKey;
      metric: MeasurementTestType;
      property: keyof IperfTestProperty;
      title: string;
    }[] = [];
    for (const metric of selectedMetrics) {
      if (metric === "signalStrength") {
        list.push({
          key: metric,
          metric,
          property: "signalStrength",
          title: metricTitles[metric],
        });
      } else {
        for (const property of selectedProperties) {
          if (getAvailableProperties(metric).includes(property)) {
            list.push({
              key: `${metric}-${property}`,
              metric,
              property,
              title: `${metricTitles[metric]}: ${propertyTitles[property]}`,
            });
          }
        }
      }
    }
    return list;
  }, [selectedMetrics, selectedProperties]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRendering(true);
      const next: Record<HeatmapKey, Rendered> = {};
      for (const w of wanted) {
        next[w.key] = await renderHeatmap(w.metric, w.property);
        if (cancelled) return;
      }
      setHeatmaps(next);
      setRendering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, renderHeatmap]);

  /* ---------- controls ---------- */

  const toggleMetric = (metric: MeasurementTestType) =>
    setSelectedMetrics((prev) =>
      (prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric]
      ).sort(
        (a, b) =>
          Object.keys(testTypes).indexOf(a) - Object.keys(testTypes).indexOf(b),
      ),
    );

  const toggleProperty = (property: keyof IperfTestProperty) =>
    setSelectedProperties((prev) =>
      (prev.includes(property)
        ? prev.filter((p) => p !== property)
        : [...prev, property]
      ).sort(
        (a, b) =>
          Object.keys(testProperties).indexOf(a) -
          Object.keys(testProperties).indexOf(b),
      ),
    );

  const anyIperfSelected = selectedMetrics.some((m) => m !== "signalStrength");

  const checkboxRow = (
    id: string,
    label: string,
    checked: boolean,
    onChange: () => void,
    note?: string,
  ) => (
    <label
      key={id}
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 rounded-md py-1 text-sm"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
      {note && (
        <span className="ml-auto text-xs text-muted-foreground">{note}</span>
      )}
    </label>
  );

  /* ---------- render ---------- */

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Heat maps</h1>
        <p className="text-sm text-muted-foreground">
          Green is good. Adjust the radius until the spots grow together, then
          download the maps you need.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-[7.5rem] lg:self-start">
          <div>
            <h2 className="mb-1.5 text-sm font-medium">Show</h2>
            {Object.values(testTypes).map((metric) =>
              checkboxRow(
                `metric-${metric}`,
                metricTitles[metric],
                selectedMetrics.includes(metric),
                () => toggleMetric(metric),
              ),
            )}
          </div>

          {anyIperfSelected && (
            <div>
              <h2 className="mb-1.5 text-sm font-medium">Throughput detail</h2>
              {Object.values(testProperties)
                .filter((p) => p !== "signalStrength")
                .map((property) =>
                  checkboxRow(
                    `property-${property}`,
                    propertyTitles[property],
                    selectedProperties.includes(property),
                    () => toggleProperty(property),
                    propertyNotes[property],
                  ),
                )}
            </div>
          )}

          <HeatmapSlider
            value={radius}
            isAuto={settings.radiusDivider === null}
            onChange={(r) => updateSettings({ radiusDivider: r })}
            onReset={() => updateSettings({ radiusDivider: null })}
          />

          {selectedMetrics.includes("signalStrength") && (
            <label className="flex items-center gap-2.5 text-sm">
              <Switch
                id="signal-strength-percentage"
                checked={asPercentage}
                onCheckedChange={setAsPercentage}
              />
              Signal legend in {asPercentage ? "percent" : "dBm"}
            </label>
          )}

          <p className="text-xs text-muted-foreground">
            {enabledPoints.length} of {points.length} point
            {points.length === 1 ? "" : "s"} used
            {rendering ? ", rendering" : ""}
          </p>
        </aside>

        <div
          className={cn(
            "grid gap-5",
            wanted.length <= 1
              ? "grid-cols-1"
              : "md:grid-cols-2 2xl:grid-cols-3",
          )}
          data-testid="heatmap-gallery"
        >
          {points.length === 0 && (
            <EmptyTile
              title="No measurements yet"
              body="Take a few measurements on the Floor plan tab and the heat maps appear here."
            />
          )}
          {wanted.map((w) => {
            const r = heatmaps[w.key];
            if (points.length === 0) return null;
            if (!r) return <SkeletonTile key={w.key} title={w.title} />;
            if (!r.src) {
              return (
                <EmptyTile
                  key={w.key}
                  title={w.title}
                  body={
                    w.metric === "signalStrength"
                      ? "Could not render this map."
                      : settings.iperfServerAdrs === "localhost"
                        ? "Throughput tests are off. Set an iperf3 server in Settings to measure it."
                        : "No points have this measurement yet."
                  }
                />
              );
            }
            return (
              <figure
                key={w.key}
                className="space-y-1.5"
                data-testid={`heatmap-${w.key}`}
              >
                <HeatmapImage
                  src={r.src}
                  alt={w.title}
                  onClick={() => setEnlarged({ src: r.src!, alt: w.title })}
                />
                <figcaption className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{w.title}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {r.count} point{r.count === 1 ? "" : "s"}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>

      <HeatmapModal
        src={enlarged?.src ?? ""}
        alt={enlarged?.alt ?? ""}
        open={enlarged !== null}
        onClose={() => setEnlarged(null)}
      />
    </div>
  );
}

function EmptyTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex aspect-[4/3] flex-col items-start justify-end rounded-md border border-dashed p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function SkeletonTile({ title }: { title: string }) {
  return (
    <div className="space-y-1.5">
      <div className="aspect-[4/3] animate-pulse rounded-md border bg-muted" />
      <p className="text-sm font-medium">{title}</p>
    </div>
  );
}
