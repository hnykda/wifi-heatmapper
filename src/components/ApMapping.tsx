import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApMapping } from "@/lib/types";
import {
  formatMacAddress,
  isValidMacAddress,
  normalizeMacAddress,
} from "@/lib/utils";

type Props = {
  apMapping: ApMapping[];
  onSave: (apMapping: ApMapping[]) => void;
};

/**
 * Give each access point (BSSID) a name. Names show up in the survey
 * point details and table instead of a bare MAC address.
 * Rows are edited in place; a MAC address is checked when you leave the field.
 */
export default function EditableApMapping({ apMapping, onSave }: Props) {
  const [rows, setRows] = useState<ApMapping[]>(apMapping);
  const [errors, setErrors] = useState<Record<number, string>>({});

  useEffect(() => setRows(apMapping), [apMapping]);

  const commit = (next: ApMapping[]) => {
    setRows(next);
    const errs: Record<number, string> = {};
    next.forEach((ap, i) => {
      if (ap.macAddress && !isValidMacAddress(ap.macAddress)) {
        errs[i] = "A MAC address has 12 hex digits, e.g. 9E:05:D6:96:E8:30";
      }
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      onSave(
        next.map((ap) => ({
          apName: ap.apName.trim(),
          macAddress: normalizeMacAddress(ap.macAddress),
        })),
      );
    }
  };

  const edit = (i: number, field: keyof ApMapping, value: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [field]: value } : r));
    setRows(next);
  };

  return (
    <div className="space-y-2" data-testid="ap-mapping">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No access points named yet.
        </p>
      )}
      {rows.map((ap, i) => (
        <div key={i} className="grid gap-1">
          <div className="grid grid-cols-[1fr_1fr_2.25rem] gap-2">
            <Input
              aria-label="Access point name"
              placeholder="Living room AP"
              value={ap.apName}
              onChange={(e) => edit(i, "apName", e.target.value)}
              onBlur={() => commit(rows)}
            />
            <Input
              aria-label="MAC address"
              placeholder="9E:05:D6:96:E8:30"
              className="font-mono text-xs"
              value={ap.macAddress}
              onChange={(e) => edit(i, "macAddress", e.target.value)}
              onBlur={() =>
                commit(
                  rows.map((r, j) =>
                    j === i && isValidMacAddress(r.macAddress)
                      ? {
                          ...r,
                          macAddress: formatMacAddress(
                            normalizeMacAddress(r.macAddress),
                          ),
                        }
                      : r,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove access point"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {errors[i] && <p className="text-xs text-destructive">{errors[i]}</p>}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setRows([...rows, { apName: "", macAddress: "" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add access point
      </Button>
    </div>
  );
}
