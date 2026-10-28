"use client";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { getSurvey } from "@/lib/fileHandler";
import { downloadText } from "@/lib/exportCsv";
import { sanitizeFilename } from "@/lib/utils";

/**
 * Downloads the survey as the server has it saved (points and settings,
 * never the sudo password), under the same name as the file on disk.
 */
export function ExportSurveyButton({
  floorplan,
  variant = "outline",
  className,
  children = "Export JSON",
  testId = "export-json",
}: {
  floorplan: string;
  variant?: "outline" | "link";
  className?: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  const exportJson = async () => {
    const survey = await getSurvey(floorplan).catch(() => undefined);
    if (!survey) {
      toast({
        variant: "destructive",
        title: "Could not export the survey",
        description:
          survey === null
            ? "Nothing is saved for this floor plan yet."
            : "The app did not answer. Try again.",
      });
      return;
    }
    downloadText(
      JSON.stringify(survey, null, 2),
      `${sanitizeFilename(floorplan)}.json`,
      "application/json",
    );
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={() => void exportJson()}
      disabled={!floorplan}
      data-testid={testId}
    >
      {variant === "outline" && <Download className="h-3.5 w-3.5" />}
      {children}
    </Button>
  );
}
