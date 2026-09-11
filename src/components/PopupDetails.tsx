import React from "react";
import { X, Trash2 } from "lucide-react";
import { SurveyPoint, HeatmapSettings, SurveyPointActions } from "@/lib/types";
import { formatMacAddress } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AlertDialogModal } from "@/components/AlertDialogModal";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";

interface PopupDetailsProps {
  point: SurveyPoint | null;
  settings: HeatmapSettings;
  surveyPointActions: SurveyPointActions;
  onClose: () => void;
}

/**
 * Details of one survey point, shown next to it on the floor plan.
 * Renders nothing when `point` is null.
 */
const PopupDetails: React.FC<PopupDetailsProps> = ({
  point,
  settings,
  surveyPointActions,
  onClose,
}) => {
  if (!point) return null;

  const wifi = point.wifiData;
  const apName = settings.apMapping.find(
    (ap) => ap.macAddress === wifi?.bssid,
  )?.apName;
  const color = objectToRGBAString({
    ...getColorAt(wifi.signalStrength / 100, settings.gradient),
    a: 1,
  });

  const mbps = (bps: number) => (bps / 1_000_000).toFixed(1);
  const hasIperf =
    point.iperfData &&
    (point.iperfData.tcpDownload.bitsPerSecond > 0 ||
      point.iperfData.tcpUpload.bitsPerSecond > 0);

  const rows: [string, React.ReactNode][] = [
    ["Signal", `${wifi.signalStrength}% (${wifi.rssi} dBm)`],
    ["Network", wifi.ssid || "not available"],
    [
      "Access point",
      apName
        ? `${apName}`
        : formatMacAddress(wifi.bssid || "") || "not available",
    ],
    [
      "Channel",
      wifi.channel ? `${wifi.channel} (${wifi.band} GHz)` : "not available",
    ],
  ];
  if (hasIperf) {
    rows.push(
      [
        "TCP down / up",
        `${mbps(point.iperfData.tcpDownload.bitsPerSecond)} / ${mbps(point.iperfData.tcpUpload.bitsPerSecond)} Mbps`,
      ],
      [
        "UDP down / up",
        `${mbps(point.iperfData.udpDownload.bitsPerSecond)} / ${mbps(point.iperfData.udpUpload.bitsPerSecond)} Mbps`,
      ],
    );
  } else {
    rows.push(["Throughput", "not measured"]);
  }
  rows.push(["Measured", new Date(point.timestamp).toLocaleString()]);

  return (
    <div
      className="w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-float"
      data-testid="point-details"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-black/20"
          style={{ background: color }}
          aria-hidden="true"
        />
        <h3 className="truncate text-sm font-semibold">{point.id}</h3>
        <span className="tabular ml-auto text-xs text-muted-foreground">
          x {point.x}, y {point.y}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="truncate text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2">
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={point.isEnabled}
            onCheckedChange={(v) =>
              surveyPointActions.update(point, { isEnabled: v })
            }
            aria-label="Use this point in heat maps"
          />
          {point.isEnabled ? "Used in heat maps" : "Ignored"}
        </label>
        <AlertDialogModal
          title={`Delete ${point.id}?`}
          description="The measurement is removed from this survey. This cannot be undone."
          confirmLabel="Delete point"
          destructive
          onCancel={() => {}}
          onConfirm={() => {
            surveyPointActions.delete([point]);
            onClose();
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </AlertDialogModal>
      </div>
    </div>
  );
};

export default PopupDetails;
