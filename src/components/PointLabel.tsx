import React, { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cleanPointLabel, POINT_LABEL_MAX, pointName } from "@/lib/point-label";
import { cn } from "@/lib/utils";

interface PointLabelProps {
  point: { id: string; label?: string };
  /** the new label; "" removes it */
  onSave: (label: string) => void;
  className?: string;
}

/**
 * A point's name, editable in place: click it to edit, Enter or leaving
 * the field saves, Escape cancels. Without a label it shows the id.
 */
export function PointLabel({ point, onSave, className }: PointLabelProps) {
  // null: not editing; otherwise what is typed
  const [draft, setDraft] = useState<string | null>(null);
  // set once an edit has been saved or cancelled, so the blur that follows
  // (the field goes away) doesn't save it again
  const settled = useRef(false);

  const start = () => {
    settled.current = false;
    setDraft(point.label ?? "");
  };

  const finish = (save: boolean) => {
    if (settled.current || draft === null) return;
    settled.current = true;
    const next = cleanPointLabel(draft) ?? "";
    setDraft(null);
    if (save && next !== (point.label ?? "")) onSave(next);
  };

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={start}
        title="Rename this point"
        className={cn(
          "group inline-flex min-w-0 items-center gap-1.5 rounded px-1 -mx-1 text-left hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        data-testid="point-name"
      >
        <span className="truncate">{pointName(point)}</span>
        <Pencil
          className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
        <span className="sr-only">Rename</span>
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      maxLength={POINT_LABEL_MAX}
      placeholder={point.id}
      aria-label={`Name of ${point.id}`}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          // only the edit is cancelled, not the popup or dialog around it
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      className={cn("h-7 px-2 py-0 text-sm", className)}
      data-testid="point-name-input"
    />
  );
}
