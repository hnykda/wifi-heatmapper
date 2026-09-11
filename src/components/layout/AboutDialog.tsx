"use client";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppStatus } from "@/hooks/useAppStatus";

const REPO = "https://github.com/hnykda/wifi-heatmapper";

/**
 * About: what is running, where the data lives, where to get help.
 * The same facts the server prints at start-up, for bug reports.
 */
export function AboutDialog() {
  const status = useAppStatus();
  const rows: [string, string][] = status
    ? [
        ["Version", status.version],
        ["Operating system", status.osName],
        ["Node", status.nodeVersion],
        ["iperf3", status.iperf3Version ?? "not installed"],
        ["Data folder", status.dataDir],
        ["Docker", status.docker ? "yes" : "no"],
        ["Measurements", status.mockMode ? "mock (synthetic)" : "real"],
      ]
    : [];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="About Wi-Fi Heatmapper"
          title="About"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Wi-Fi Heatmapper</DialogTitle>
          <DialogDescription>
            Measures Wi-Fi signal strength and throughput where you stand, and
            draws heat maps on your floor plan. Everything stays on this
            computer.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Include the rows above when you{" "}
          <a
            className="prose-link"
            href={`${REPO}/issues/new/choose`}
            target="_blank"
            rel="noreferrer"
          >
            report a problem
          </a>
          . Read the{" "}
          <a
            className="prose-link"
            href={`${REPO}/blob/main/docs/User_Interface.md`}
            target="_blank"
            rel="noreferrer"
          >
            user guide
          </a>{" "}
          or the{" "}
          <a
            className="prose-link"
            href={`${REPO}/blob/main/docs/FAQ.md`}
            target="_blank"
            rel="noreferrer"
          >
            FAQ
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
