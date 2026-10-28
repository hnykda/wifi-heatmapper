"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { useSettings } from "@/components/GlobalSettings";
import { listSurveys } from "@/lib/fileHandler";
import { COPY_PART_NAMES, CopyPart } from "@/lib/survey-ops";
import { cn, sanitizeFilename } from "@/lib/utils";

const PARTS: Record<CopyPart, { label: string; detail: string }> = {
  speed: {
    label: "Speed settings",
    detail: "What to measure, the speed test server, duration and commands",
  },
  apNames: {
    label: "Access point names",
    detail: "The names you gave your access points",
  },
  heatmapLook: {
    label: "Heat map look",
    detail: "Spot size, opacity, colours and fixed colour scales",
  },
};

const DEFAULT_PARTS: Record<CopyPart, boolean> = {
  speed: true,
  apNames: false,
  heatmapLook: false,
};

/**
 * "Copy settings from…": pick another survey and what to copy from it into
 * the current one. The server does the copy; points and the floor plan
 * stay as they are.
 */
export function CopySettingsDialog() {
  const { settings, copySettingsFrom } = useSettings();
  const [open, setOpen] = useState(false);
  const [surveys, setSurveys] = useState<string[] | null>(null);
  const [from, setFrom] = useState("");
  const [parts, setParts] = useState(DEFAULT_PARTS);
  const [copying, setCopying] = useState(false);

  const current = sanitizeFilename(settings.floorplanImageName);

  const onOpenChange = async (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setParts(DEFAULT_PARTS);
    setSurveys(null);
    try {
      const others = (await listSurveys())
        .filter((name) => name !== current)
        .sort((a, b) => a.localeCompare(b));
      setSurveys(others);
      setFrom((f) => (others.includes(f) ? f : (others[0] ?? "")));
    } catch {
      setSurveys([]);
    }
  };

  const chosen = COPY_PART_NAMES.filter((p) => parts[p]);

  const copy = async () => {
    if (!from || chosen.length === 0) return;
    setCopying(true);
    const ok = await copySettingsFrom(from, chosen);
    setCopying(false);
    if (!ok) return; // the toast says why
    setOpen(false);
    toast({
      title: "Settings copied",
      description: `${chosen
        .map((p, i) =>
          i === 0 ? PARTS[p].label : PARTS[p].label.toLowerCase(),
        )
        .join(", ")} from ${from}.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => void onOpenChange(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="copy-settings-open">
          <Copy className="h-4 w-4" />
          Copy settings from…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="copy-settings-dialog">
        <DialogHeader>
          <DialogTitle>Copy settings from another survey</DialogTitle>
          <DialogDescription>
            Into {settings.floorplanImageName}. Its points and floor plan stay
            as they are.
          </DialogDescription>
        </DialogHeader>

        {surveys === null ? (
          <p className="text-sm text-muted-foreground">Loading surveys…</p>
        ) : surveys.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="copy-settings-none"
          >
            There are no other surveys yet. Set up one floor plan, then copy its
            settings to the next.
          </p>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="copy-from" className="text-sm font-medium">
                Copy from
              </Label>
              <select
                id="copy-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                data-testid="copy-settings-source"
                className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              >
                {surveys.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">
                What to copy
              </legend>
              {COPY_PART_NAMES.map((part) => (
                <label
                  key={part}
                  htmlFor={`copy-part-${part}`}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md py-1 text-sm"
                >
                  <Checkbox
                    id={`copy-part-${part}`}
                    data-testid={`copy-part-${part}`}
                    className="mt-0.5"
                    checked={parts[part]}
                    onCheckedChange={(c) =>
                      setParts((p) => ({ ...p, [part]: c === true }))
                    }
                  />
                  <span>
                    {PARTS[part].label}
                    <span className="block text-xs text-muted-foreground">
                      {PARTS[part].detail}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={!from || chosen.length === 0 || copying}
            onClick={() => void copy()}
            data-testid="copy-settings-confirm"
            className={cn(copying && "cursor-wait")}
          >
            {copying ? "Copying…" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
