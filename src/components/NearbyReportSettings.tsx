"use client";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  accessPointLabel,
  NearbyBand,
  NearbyNetworkGroup,
  NearbyReportSettings as Report,
  NearbySplit,
  networkName,
} from "@/lib/nearby-networks";
import { cn } from "@/lib/utils";

const SPLITS: { value: NearbySplit; label: string }[] = [
  { value: "combined", label: "One map" },
  { value: "network", label: "Per network" },
  { value: "accessPoint", label: "Per access point" },
];

/** "5" for 5 GHz: safe in ids and test ids. */
export function bandId(band: NearbyBand): string {
  return String(band).replace(".", "-");
}

/**
 * The controls of one band's nearby-network report, in the Heat maps
 * sidebar: show it, how to split its maps, and which access points
 * (grouped by network) it includes. Every change is saved with the survey.
 */
export function NearbyReportSettings({
  band,
  report,
  groups,
  apName,
  onChange,
}: {
  band: NearbyBand;
  report: Report;
  groups: NearbyNetworkGroup[];
  apName: (bssid: string) => string | undefined;
  onChange: (patch: Partial<Report>) => void;
}) {
  const id = bandId(band);
  const hidden = new Set(report.hidden);
  const all = groups.flatMap((g) => g.accessPoints.map((ap) => ap.key));
  const included = all.filter((key) => !hidden.has(key)).length;

  /** Include or leave out these access points. */
  const setIncluded = (keys: string[], include: boolean) => {
    const next = new Set(report.hidden);
    for (const key of keys) {
      if (include) next.delete(key);
      else next.add(key);
    }
    onChange({ hidden: [...next] });
  };

  return (
    <div className="space-y-1.5" data-testid={`nearby-report-settings-${id}`}>
      <label
        htmlFor={`nearby-band-${id}`}
        className="flex cursor-pointer items-center gap-2.5 py-1 text-sm"
      >
        <Checkbox
          id={`nearby-band-${id}`}
          checked={report.shown}
          onCheckedChange={(on) => onChange({ shown: on === true })}
          data-testid={`nearby-band-${id}`}
        />
        <span>{band} GHz report</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {included} of {all.length}
        </span>
      </label>

      {report.shown && (
        <div className="space-y-1.5 border-l pl-3">
          <div
            role="radiogroup"
            aria-label={`${band} GHz maps`}
            className="flex flex-wrap gap-1"
          >
            {SPLITS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={report.split === s.value}
                onClick={() => onChange({ split: s.value })}
                data-testid={`nearby-split-${id}-${s.value}`}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs transition-colors",
                  report.split === s.value
                    ? "border-brand bg-brand-soft/60 font-medium"
                    : "bg-surface hover:border-brand/50",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Accordion type="single" collapsible>
            <AccordionItem value="aps" className="border-b-0">
              <AccordionTrigger
                className="py-1 text-xs font-medium text-muted-foreground"
                data-testid={`nearby-aps-toggle-${id}`}
              >
                Access points ({included} of {all.length})
              </AccordionTrigger>
              <AccordionContent className="pt-1">
                <div className="mb-1 flex gap-3 text-xs">
                  <button
                    type="button"
                    className="prose-link"
                    onClick={() => onChange({ hidden: [] })}
                    data-testid={`nearby-aps-all-${id}`}
                  >
                    Tick all
                  </button>
                  <button
                    type="button"
                    className="prose-link"
                    onClick={() => onChange({ hidden: all })}
                    data-testid={`nearby-aps-none-${id}`}
                  >
                    Untick all
                  </button>
                </div>
                {groups.map((group, g) => {
                  const keys = group.accessPoints.map((ap) => ap.key);
                  const shown = keys.filter((k) => !hidden.has(k)).length;
                  const groupId = `nearby-net-${id}-${g}`;
                  return (
                    <div key={group.ssid} className="py-0.5">
                      <label
                        htmlFor={groupId}
                        className="flex cursor-pointer items-center gap-2.5 py-0.5 text-sm"
                      >
                        <Checkbox
                          id={groupId}
                          checked={
                            shown === keys.length
                              ? true
                              : shown === 0
                                ? false
                                : "indeterminate"
                          }
                          onCheckedChange={() =>
                            setIncluded(keys, shown < keys.length)
                          }
                        />
                        <span className="truncate font-medium">
                          {networkName(group.ssid)}
                        </span>
                      </label>
                      {group.accessPoints.map((ap, a) => {
                        const apId = `${groupId}-${a}`;
                        const name = ap.bssid ? apName(ap.bssid) : undefined;
                        return (
                          <label
                            key={ap.key}
                            htmlFor={apId}
                            className="flex cursor-pointer items-center gap-2 py-0.5 pl-4 text-xs"
                            title={`${accessPointLabel(ap)} · channel ${ap.channel} · strongest ${ap.strongest}%`}
                          >
                            <Checkbox
                              id={apId}
                              checked={!hidden.has(ap.key)}
                              onCheckedChange={(on) =>
                                setIncluded([ap.key], on === true)
                              }
                              data-testid="nearby-ap"
                            />
                            <span
                              className={cn("truncate", !name && "font-mono")}
                            >
                              {name ?? accessPointLabel(ap).split(" · ").pop()}
                            </span>
                            <span className="tabular ml-auto shrink-0 text-muted-foreground">
                              {ap.strongest}%
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}
