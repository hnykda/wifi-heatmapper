"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { AlertDialogModal } from "@/components/AlertDialogModal";
import { mediaUrlFor } from "@/lib/media-url";
import { cn } from "@/lib/utils";

type FloorplanPickerProps = {
  value: string; // current floor plan file name
  pointCount: number;
  onChange: (name: string) => void;
  onDelete: (name: string) => Promise<void>;
};

/**
 * Pick, upload or delete a floor plan image.
 * Images live in <data dir>/media and are served by /api/media/<name>.
 */
export default function FloorplanPicker({
  value,
  pointCount,
  onChange,
  onDelete,
}: FloorplanPickerProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/media");
      if (!res.ok) throw new Error("Could not list floor plans");
      const data = await res.json();
      setFiles(data.files as string[]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/media", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description:
            body.error ??
            "The file could not be saved. Use a PNG, JPEG or WebP image.",
        });
        return;
      }
      await fetchFiles();
      onChange(body.name as string);
      toast({
        title: "Floor plan added",
        description: `${body.name} is now the current floor plan.`,
      });
    } finally {
      setUploading(false);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <DropdownMenu.Root onOpenChange={() => setSearch("")}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              data-testid="floorplan-picker"
              className="field inline-flex items-center justify-between gap-2 text-left"
            >
              <span className="truncate">{value || "Choose a floor plan"}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[16rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-float"
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
                    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-accent",
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
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent"
            >
              <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
              Upload an image
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          data-testid="floorplan-file-input"
        />
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <ImagePlus className="h-4 w-4" />
          {uploading ? "Uploading" : "Upload"}
        </Button>
        <AlertDialogModal
          title={`Delete "${value}"?`}
          description={
            pointCount > 0
              ? `This removes the image and its ${pointCount} survey point${pointCount === 1 ? "" : "s"}. This cannot be undone.`
              : "This removes the image and its (empty) survey file."
          }
          confirmLabel="Delete floor plan"
          destructive
          onConfirm={async () => {
            await onDelete(value);
            await fetchFiles();
          }}
          onCancel={() => {}}
          disabled={!value}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Delete this floor plan"
            title="Delete this floor plan"
            data-testid="floorplan-delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogModal>
      </div>

      {value && (
        <div className="sm:col-span-2">
          <img
            src={mediaUrlFor(value)}
            alt={`Preview of ${value}`}
            className="max-h-40 rounded-md border bg-white object-contain p-1"
            data-testid="floorplan-preview"
          />
        </div>
      )}
    </div>
  );
}
