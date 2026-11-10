import React, { useState } from "react";
import { Router, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCESS_POINT_NAME_MAX,
  ACCESS_POINT_NOTE_MAX,
  cleanAccessPointNote,
} from "@/lib/access-points";
import type { AccessPoint } from "@/lib/types";

interface AccessPointDetailsProps {
  ap: AccessPoint;
  /** the changed fields; a note of undefined removes it */
  onChange: (patch: Partial<Omit<AccessPoint, "id">>) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * An access point marker's name and note, next to it on the floor plan.
 * Both save when you leave the field (Enter saves the name). Give it a
 * `key` of the marker's id, so another marker starts with its own text.
 */
export default function AccessPointDetails({
  ap,
  onChange,
  onDelete,
  onClose,
}: AccessPointDetailsProps) {
  const [name, setName] = useState(ap.name);
  const [note, setNote] = useState(ap.note ?? "");

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
      className="w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-float"
      data-testid="access-point-details"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Router className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
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
      <div className="space-y-1.5 px-3 py-2">
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
          className="min-h-16 text-xs"
          data-testid="access-point-note"
        />
        <p className="text-xs text-muted-foreground">
          Drag the marker to move it. It does not change the heat maps.
        </p>
      </div>
      <div className="flex items-center justify-end border-t bg-muted/40 px-3 py-2">
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
