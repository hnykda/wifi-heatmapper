"use client";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/components/GlobalSettings";
import {
  buildIssueUrl,
  DiagnosticsReport,
  PASTE_HINT,
} from "@/lib/diagnostics";
import { PASSWORD_PLACEHOLDER } from "@/lib/redact";
import { closeReport, useReportState } from "./report-store";

/** Belt and braces: the server already removed it, but the browser knows it. */
function withoutPassword(
  report: DiagnosticsReport,
  password: string,
): DiagnosticsReport {
  if (!password || password.length < 3) return report;
  const scrub = (s: string) => s.split(password).join(PASSWORD_PLACEHOLDER);
  return {
    ...report,
    os: scrub(report.os),
    runMode: scrub(report.runMode),
    wifiMethod: scrub(report.wifiMethod),
    problem: report.problem ? scrub(report.problem) : null,
    summary: scrub(report.summary),
    logExcerpt: scrub(report.logExcerpt),
    text: scrub(report.text),
  };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older webviews: a hidden textarea and execCommand
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function fetchDiagnostics(
  survey: string,
  problem: string | null | undefined,
  includeNetwork: boolean,
): Promise<DiagnosticsReport> {
  const params = new URLSearchParams();
  if (survey) params.set("survey", survey);
  if (problem) params.set("problem", problem);
  if (includeNetwork) params.set("network", "include");
  const res = await fetch(`/api/diagnostics?${params}`);
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);
  return (await res.json()) as DiagnosticsReport;
}

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * "Report a problem": shows exactly what would be shared (diagnostics and
 * recent log, redacted), then opens a prefilled GitHub issue in the browser
 * or copies the text. Nothing is sent from here.
 */
export function ReportProblemDialog() {
  const { open, problem } = useReportState();
  const { settings } = useSettings();
  const [includeNetwork, setIncludeNetwork] = useState(false);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);

  const survey = settings.floorplanImageName;
  const password = settings.sudoerPassword;

  const load = () => {
    setLoadError(null);
    return fetchDiagnostics(survey, problem, includeNetwork).then(
      (r) => setReport(r),
      (err: unknown) => {
        setReport(null);
        setLoadError(errorMessage(err));
      },
    );
  };

  // (Re)load whenever the dialog opens or what goes into the report changes
  useEffect(() => {
    if (!open) return;
    let current = true;
    fetchDiagnostics(survey, problem, includeNetwork).then(
      (r) => {
        if (!current) return;
        setReport(r);
        setLoadError(null);
      },
      (err: unknown) => {
        if (!current) return;
        setReport(null);
        setLoadError(errorMessage(err));
      },
    );
    return () => {
      current = false;
    };
  }, [open, survey, problem, includeNetwork]);

  const safe = report ? withoutPassword(report, password) : null;
  const link = safe ? buildIssueUrl(safe) : null;

  const copy = async () => {
    if (!safe) return false;
    const ok = await copyText(safe.text);
    setCopied(ok ? "ok" : "failed");
    return ok;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        closeReport();
        setCopied(null);
        setIncludeNetwork(false); // hidden again next time
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="report-dialog">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            Wi-Fi works differently on every system and version. Reports like
            yours are how we fix it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3">
          <Switch
            id="report-include-network"
            checked={includeNetwork}
            onCheckedChange={setIncludeNetwork}
            data-testid="report-include-network"
          />
          <div className="grid gap-0.5">
            <Label htmlFor="report-include-network">
              Include network names and addresses
            </Label>
            <p className="text-xs text-muted-foreground">
              Off: they show as &lt;ssid-1&gt;, &lt;mac-1&gt;, &lt;ip-1&gt;.
              Your sudo password is never included.
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <p className="text-sm font-medium">
            What will be shared
            {safe && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · details and the last {safe.logLineCount} log lines
              </span>
            )}
          </p>
          {loadError ? (
            <div className="rounded-md border p-3 text-sm">
              Could not collect the details: {loadError}{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => void load()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <pre
              className="max-h-72 min-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs"
              data-testid="report-preview"
              data-network-hidden={
                safe ? String(safe.networkHidden) : undefined
              }
            >
              {safe ? safe.text : "Collecting details…"}
            </pre>
          )}
        </div>

        {link && !link.complete && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="report-too-long"
          >
            This is too long for a link, so the issue gets a short summary.
            &ldquo;Open GitHub issue&rdquo; copies everything first: paste it
            where the issue says &ldquo;{PASTE_HINT}&rdquo;
          </p>
        )}
        {copied === "failed" && (
          <p className="text-xs text-destructive">
            Could not copy. Select the text above and copy it yourself.
          </p>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Opens GitHub in your browser. Nothing is sent until you submit it
            there.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!safe}
              onClick={() => void copy()}
              data-testid="report-copy"
            >
              {copied === "ok" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied === "ok" ? "Copied" : "Copy diagnostics"}
            </Button>
            <Button variant="brand" size="sm" asChild disabled={!link}>
              <a
                href={link?.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                data-testid="report-open-issue"
                aria-disabled={!link}
                onClick={(e) => {
                  if (!link) {
                    e.preventDefault();
                    return;
                  }
                  // the link only has the summary: put the rest on the clipboard
                  if (!link.complete) void copy();
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open GitHub issue
              </a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
