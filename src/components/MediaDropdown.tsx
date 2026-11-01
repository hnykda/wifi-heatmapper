"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { AlertDialogModal } from "@/components/AlertDialogModal";
import { cn } from "@/lib/utils";

async function listFloorplans(): Promise<string[]> {
  const res = await fetch("/api/media");
  if (!res.ok) throw new Error("Could not list floor plans");
  const data = await res.json();
  return data.files as string[];
}

/** Upload an image; resolves to its saved name, or to an error message. */
async function uploadFloorplan(
  file: File,
): Promise<{ name: string } | { error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/media", { method: "POST", body: formData });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      error:
        body.error ??
        "The file could not be saved. Use a PNG, JPEG or WebP image.",
    };
  }
  return { name: body.name as string };
}

/**
 * Pick or upload a floor plan image: a menu of the saved images and an
 * Upload button, compact enough for the survey bar.
 * Images live in <data dir>/media and are served by /api/media/<name>.
 * The list is read again each time the menu opens, so an image deleted or
 * added elsewhere shows up.
 */
export default function FloorplanPicker({
  value,
  onChange,
}: {
  value: string; // current floor plan file name
  onChange: (name: string) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showFiles = (list: string[]) => {
    setFiles(list);
    setError(null);
  };
  const showError = (err: unknown) => setError((err as Error).message);
  const fetchFiles = () => listFloorplans().then(showFiles, showError);

  useEffect(() => {
    let current = true;
    listFloorplans().then(
      (list) => current && showFiles(list),
      (err: unknown) => current && showError(err),
    );
    return () => {
      current = false;
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    const result = await uploadFloorplan(file).catch((err: unknown) => ({
      error: String(err),
    }));
    if ("error" in result) {
      setUploading(false);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: result.error,
      });
      return;
    }
    await fetchFiles();
    onChange(result.name);
    setUploading(false);
    toast({
      title: "Floor plan added",
      description: `${result.name} is now the current floor plan.`,
    });
  };

  const filteredFiles = files.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <DropdownMenu.Root
        onOpenChange={(open) => {
          setSearch("");
          if (open) void fetchFiles();
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            data-testid="floorplan-picker"
            aria-label={`Floor plan: ${value || "none"}. Choose another`}
            className="field inline-flex h-9 w-auto max-w-[min(22rem,70vw)] items-center justify-between gap-2 text-left"
          >
            <span className="truncate">{value || "Choose a floor plan"}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[16rem] max-w-[90vw] rounded-md border bg-popover p-1 text-popover-foreground shadow-float"
        >
          {files.length > 6 && (
            <div className="p-1 pb-2">
              <input
                type="text"
                placeholder="Filter"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field h-8"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto">
            {filteredFiles.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                No floor plans match.
              </div>
            )}
            {filteredFiles.map((item) => (
              <DropdownMenu.Item
                key={item}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden",
                  "data-highlighted:bg-accent",
                  item === value && "font-medium",
                )}
                onSelect={() => onChange(item)}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0 text-brand",
                    item !== value && "invisible",
                  )}
                />
                <span className="truncate">{item}</span>
              </DropdownMenu.Item>
            ))}
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            onSelect={() => fileInputRef.current?.click()}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent"
          >
            <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            Upload an image
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        data-testid="floorplan-upload"
        title="Upload a PNG, JPEG or WebP image of your floor plan. A photo of a sketch works fine."
      >
        <ImagePlus className="h-4 w-4" />
        {uploading ? "Uploading" : "Upload your floor plan"}
      </Button>

      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        data-testid="floorplan-file-input"
      />
      {error && <p className="basis-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Delete the current floor plan and its survey, after asking. */
export function DeleteFloorplanButton({
  value,
  pointCount,
  onDelete,
}: {
  value: string;
  pointCount: number;
  onDelete: (name: string) => Promise<void>;
}) {
  return (
    <AlertDialogModal
      title={`Delete "${value}"?`}
      description={
        pointCount > 0
          ? `This removes the image and its ${pointCount} survey point${pointCount === 1 ? "" : "s"}. This cannot be undone.`
          : "This removes the image and its (empty) survey file."
      }
      confirmLabel="Delete floor plan"
      destructive
      onConfirm={() => onDelete(value)}
      onCancel={() => {}}
      disabled={!value}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!value}
        data-testid="floorplan-delete"
      >
        <Trash2 className="h-4 w-4" />
        Delete this floor plan
      </Button>
    </AlertDialogModal>
  );
}
