"use client";
import { BookOpen, Bug, CircleHelp, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { docsUrl, RELEASES_URL } from "@/lib/diagnostics";
import { openReport } from "./report-store";
import { ReportProblemDialog } from "./ReportProblemDialog";

/**
 * The small help button in the bottom-right corner: report a problem, the
 * guide for the current tab, what's new. Links open in the system browser
 * (the desktop app sends target="_blank" links there).
 *
 * The measurement panel opens in the same corner and would cover it (and
 * leave it in the tab order, unseen), so the button hides while the panel
 * is on screen; the panel has its own "Report this" link when something
 * goes wrong.
 */
export function HelpMenu({ tab }: { tab: string }) {
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Help"
            title="Help"
            data-testid="help-button"
            className="fixed bottom-4 right-4 z-30 inline-flex [body:has([data-testid=measurement-panel])_&]:hidden h-9 w-9 items-center justify-center rounded-full border bg-popover text-muted-foreground shadow-float transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-52">
          <DropdownMenuItem
            onSelect={() => openReport()}
            data-testid="help-report"
          >
            <Bug className="mr-2 h-4 w-4 text-brand" />
            Report a problem
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={docsUrl(tab)}
              target="_blank"
              rel="noreferrer"
              data-testid="help-docs"
            >
              <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
              Docs
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              data-testid="help-whats-new"
            >
              <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
              What&apos;s new
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportProblemDialog />
    </>
  );
}
