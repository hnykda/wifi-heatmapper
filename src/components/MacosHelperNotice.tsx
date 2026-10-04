"use client";
import { MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MacosHelperStatus } from "@/lib/types";

const APP_NAME = "WiFi Heatmapper Helper";

/**
 * Shown in Settings on macOS when the native Wi-Fi helper works: no sudo
 * needed. If macOS hides the network name (no Location access yet), explain
 * why and offer to ask for it.
 */
export function MacosHelperNotice({
  helper,
  asking,
  error,
  onAuthorize,
  onRefresh,
}: {
  helper: MacosHelperStatus;
  asking: boolean;
  error: string | null;
  onAuthorize: () => void;
  onRefresh: () => void;
}) {
  if (helper.locationAuthorized) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="macos-helper-ok"
      >
        No sudo password needed here: the Wi-Fi helper reads the signal, network
        name and access point.
      </p>
    );
  }

  const refused =
    helper.locationStatus === "denied" ||
    helper.locationStatus === "restricted";
  const servicesOff = helper.locationServicesEnabled === false;

  return (
    <div className="space-y-3 text-sm" data-testid="macos-helper-location">
      <p className="text-muted-foreground">
        No sudo password needed here: the Wi-Fi helper reads the signal.
      </p>
      <p className="max-w-[60ch]">
        To also record the network name and access point, allow Location for{" "}
        <strong className="font-medium">{APP_NAME}</strong>. macOS only shares
        them with apps that have Location access. Your location itself is not
        used.
      </p>
      {(refused || servicesOff) && (
        <p
          className="max-w-[60ch] text-warning"
          data-testid="macos-helper-refused"
        >
          {servicesOff
            ? "Location Services are off. Turn them on in System Settings > Privacy & Security > Location Services, then turn on "
            : "Location access was turned off earlier. Turn it back on in System Settings > Privacy & Security > Location Services for "}
          {APP_NAME}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="brand"
          size="sm"
          onClick={onAuthorize}
          disabled={asking}
          data-testid="macos-helper-authorize"
        >
          <MapPin className="h-3.5 w-3.5" />
          {refused || servicesOff
            ? "Open Location settings"
            : "Allow Location access"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={asking}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Check again
        </Button>
      </div>
      {asking && (
        <p className="text-muted-foreground" data-testid="macos-helper-asking">
          Answer the macOS dialog. It can open behind this window or on another
          screen.
        </p>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
