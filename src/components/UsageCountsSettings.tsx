"use client";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FormSection } from "./FormRow";
import { useUsageCounts } from "@/hooks/useUsageCounts";
import { useAppStatus } from "@/hooks/useAppStatus";
import { SITE_URL } from "@/lib/diagnostics";
import {
  describeOffReason,
  isLockedOff,
  PRIVACY_DOC_PATH,
  TELEMETRY_ENV,
  USAGE_COUNTS_PROMISE,
  USAGE_COUNTS_WHY,
} from "@/lib/usage-counts";

const code = "rounded bg-muted px-1 py-0.5 font-mono text-xs";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * Settings > Usage counts: the toggle, why it is off and when the last
 * event went out, then two collapsed parts: why the app counts, and the
 * exact event (built by the server's own event builder).
 */
export function UsageCountsSettings() {
  const { info, setEnabled } = useUsageCounts();
  const status = useAppStatus();
  const locked = isLockedOff(info?.offReason ?? null);

  const toggle = async (on: boolean) => {
    if (!(await setEnabled(on))) {
      toast({
        variant: "destructive",
        title: "Could not change usage counts",
        description: "The setting was not saved. Try again.",
      });
    }
  };

  return (
    <FormSection
      title="Usage counts"
      description="Anonymous counts of installs, app starts and measurements. Never network names, addresses or results."
    >
      <div className="flex items-start gap-3">
        <Switch
          id="usageCounts"
          checked={!!info?.enabled}
          disabled={!info || locked}
          onCheckedChange={toggle}
          data-testid="usage-toggle"
          aria-describedby="usage-status"
        />
        <div className="grid gap-0.5">
          <label htmlFor="usageCounts" className="text-sm font-medium">
            Send anonymous usage counts
          </label>
          <p
            id="usage-status"
            className="text-xs text-muted-foreground"
            data-testid="usage-status"
          >
            {!info
              ? "Checking…"
              : info.offReason
                ? describeOffReason(info.offReason, {
                    desktopApp: status?.desktopApp,
                  })
                : "On. Saved for this computer, not in your surveys."}
          </p>
        </div>
      </div>

      {info && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="usage-last-sent"
        >
          {info.lastSent
            ? `Last sent: ${info.lastSent.event}, ${formatTime(info.lastSent.at)}.`
            : "Nothing sent from this computer yet."}
        </p>
      )}

      <Accordion type="multiple" className="max-w-[70ch]">
        <AccordionItem value="why">
          <AccordionTrigger
            className="py-2 text-sm font-medium"
            data-testid="usage-why-toggle"
          >
            Why
          </AccordionTrigger>
          <AccordionContent className="leading-relaxed" data-testid="usage-why">
            {USAGE_COUNTS_WHY} {USAGE_COUNTS_PROMISE}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="sent" className="border-b-0">
          <AccordionTrigger
            className="py-2 text-sm font-medium"
            data-testid="usage-sent-toggle"
          >
            What&apos;s sent
          </AccordionTrigger>
          <AccordionContent className="grid gap-3">
            {info && (
              <div className="grid gap-2">
                <p className="max-w-[70ch] text-sm text-muted-foreground">
                  A measurement sends exactly this. Install (once) and App start
                  (at most once a day) send the same without{" "}
                  <code className={code}>speed_test</code>, which only says
                  whether this survey runs speed tests, never what they
                  measured. The install id is a random id made on this computer;
                  it is only in the User-Agent header, which the server uses to
                  count each install once a day and does not store.
                </p>
                <pre
                  className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs"
                  data-testid="usage-sample"
                >
                  {`POST ${info.sample.endpoint}\n`}
                  {Object.entries(info.sample.headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n")}
                  {`\n\n${JSON.stringify(info.sample.body, null, 2)}`}
                </pre>
              </div>
            )}

            <p className="max-w-[70ch] text-sm text-muted-foreground">
              To turn it off without opening the app, start it with{" "}
              <code className={code}>{TELEMETRY_ENV}=0</code> or{" "}
              <code className={code}>DO_NOT_TRACK=1</code>.{" "}
              <a
                href={`${SITE_URL}/${PRIVACY_DOC_PATH}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand underline-offset-4 hover:underline"
                data-testid="usage-privacy-link"
              >
                Privacy and usage counts
              </a>{" "}
              lists everything in detail.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </FormSection>
  );
}
