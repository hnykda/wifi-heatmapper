import { useEffect, useState } from "react";
import { Input, InputProps } from "@/components/ui/input";

type NumberFieldProps = Omit<InputProps, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

/**
 * A number input that keeps what you type while you type it (including
 * "0." or an empty field) and only reports valid, in-range numbers.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  ...rest
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  // Follow external changes (e.g. loading another floor plan)
  useEffect(() => {
    setDraft((d) => (parseFloat(d) === value ? d : String(value)));
  }, [value]);

  const commit = (text: string) => {
    setDraft(text);
    const n = parseFloat(text);
    if (!Number.isFinite(n)) return;
    if (min !== undefined && n < min) return;
    if (max !== undefined && n > max) return;
    if (n !== value) onChange(n);
  };

  return (
    <Input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => setDraft(String(value))}
      className="tabular"
      {...rest}
    />
  );
}
