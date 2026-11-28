import React, { useState } from "react";
import { RadioTower, Router, Trash2, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCESS_POINT_ICON_NAMES,
  ACCESS_POINT_ICONS,
  ACCESS_POINT_NAME_MAX,
  ACCESS_POINT_NOTE_MAX,
  accessPointName,
  cleanAccessPointNote,
  type AccessPointIcon,
  type MeasuredBssid,
} from "@/lib/access-points";
import type { AccessPoint } from "@/lib/types";
import { cn, formatMacAddress } from "@/lib/utils";

const ICONS: Record<AccessPointIcon, React.ElementType> = {
  router: Router,
  wifi: Wifi,
  tower: RadioTower,
};

interface AccessPointDetailsProps {
  ap: AccessPoint;
  /** the BSSIDs measured in the survey, its own first (measuredBssids()) */
  measured: MeasuredBssid[];
  /** the changed fields; a note of undefined removes it */
  onChange: (patch: Partial<Omit<AccessPoint, "id">>) => void;
  /** tick (true) or untick a BSSID this access point broadcasts */
  onLinkBssid: (bssid: string, linked: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * An access point marker's name, note, icon and the BSSIDs it broadcasts,
 * next to it on the floor plan. Name and note save when you leave the
 * field (Enter saves the name). Give it a `key` of the marker's id, so
 * another marker starts with its own text.
 */
export default function AccessPointDetails({
  ap,
  measured,
  onChange,
  onLinkBssid,
  onDelete,
  onClose,
}: AccessPointDetailsProps) {
  const [name, setName] = useState(ap.name);
  const [note, setNote] = useState(ap.note ?? "");
  const own = accessPointName(ap);
  const icon = ap.icon ?? "router";
  const Icon = ICONS[icon];

  const saveName = () => {
    const next = name.trim().slice(0, ACCESS_POINT_NAME_MAX);
    setName(next);
    if (next !== ap.name) onChange({ name: next });
  };
  const saveNote = () => {
    const next = cleanAccessPointNote(note);
    setNote(next ?? "");
    if (next !== ap.note) onChange({ note: next });
  };

  return (
    <div
      className="w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-float"
      data-testid="access-point-details"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <Input
          value={name}
          maxLength={ACCESS_POINT_NAME_MAX}
          placeholder="Access point"
          aria-label="Access point name"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="h-7 min-w-0 flex-1 px-2 py-0 text-sm font-semibold"
          data-testid="access-point-name"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 px-3 py-2.5">
        <div className="space-y-1.5">
          <label
            htmlFor={`ap-note-${ap.id}`}
            className="text-xs text-muted-foreground"
          >
            Note
          </label>
          <Textarea
            id={`ap-note-${ap.id}`}
            value={note}
            maxLength={ACCESS_POINT_NOTE_MAX}
            placeholder="Model, height, which way the antennas point"
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            className="min-h-14 text-xs"
            data-testid="access-point-note"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Icon</span>
          <div
            role="radiogroup"
            aria-label="Icon"
            className="flex gap-0.5 rounded-md border p-0.5"
          >
            {ACCESS_POINT_ICON_NAMES.map((key) => {
              const Choice = ICONS[key];
              const active = key === icon;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={ACCESS_POINT_ICONS[key].label}
                  title={ACCESS_POINT_ICONS[key].label}
                  onClick={() =>
                    onChange({ icon: key === "router" ? undefined : key })
                  }
                  className={cn(
                    "flex h-6 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                    active && "bg-accent text-brand",
                  )}
                  data-testid={`access-point-icon-${key}`}
                >
                  <Choice className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        <BssidList measured={measured} own={own} onLink={onLinkBssid} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Drag the marker to move it.
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          data-testid="access-point-delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
}

/**
 * The BSSIDs measured in this survey, to tick the ones this access point
 * broadcasts. A ticked one names its points after the access point.
 */
function BssidList({
  measured,
  own,
  onLink,
}: {
  measured: MeasuredBssid[];
  own: string;
  onLink: (bssid: string, linked: boolean) => void;
}) {
  const linked = measured.filter((m) => m.name === own).length;
  return (
    <div className="space-y-1.5" data-testid="access-point-bssids">
      <div className="text-xs text-muted-foreground">
        Measured from this access point
      </div>
      {measured.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Measure a few spots first. The access points they connect to are
          listed here, nearest first.
        </p>
      ) : (
        <>
          <ul className="max-h-44 space-y-0.5 overflow-y-auto">
            {measured.map((m) => {
              const mine = m.name === own;
              const elsewhere = m.name !== undefined && !mine;
              const id = `bssid-${m.bssid}`;
              const details = [
                m.bands.length ? `${m.bands.join(" / ")} GHz` : null,
                m.ssid || null,
                `${m.points} point${m.points === 1 ? "" : "s"}`,
              ].filter(Boolean);
              return (
                <li key={m.bssid}>
                  <label
                    htmlFor={id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-accent",
                      m.byPrefix && "cursor-not-allowed opacity-70",
                    )}
                    title={
                      m.byPrefix
                        ? `Named "${m.name}" by a prefix in Settings`
                        : undefined
                    }
                  >
                    <Checkbox
                      id={id}
                      checked={mine}
                      disabled={m.byPrefix}
                      onCheckedChange={(v) => onLink(m.bssid, v === true)}
                      className="mt-0.5"
                      data-testid="access-point-bssid"
                      data-bssid={m.bssid}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs">
                        {formatMacAddress(m.bssid)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {details.join(" · ")}
                        {elsewhere && ` · now "${m.name}"`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {linked === 0 && (
            <p className="text-xs text-muted-foreground">
              Tick the ones it broadcasts (often one per band). Their points
              then show &ldquo;{own}&rdquo; instead of a MAC address.
            </p>
          )}
        </>
      )}
    </div>
  );
}
