import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { cn } from "@/lib/utils";

/**
 * A group of related settings: heading, one-line description, rows.
 * Sections are separated by rules rather than boxed in cards.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-6 border-b py-8 first:pt-0 last:border-b-0 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:gap-10",
        className,
      )}
    >
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 max-w-[36ch] text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

/** Label on top, control below, optional help popover and hint text. */
export function FormRow({
  id,
  label,
  help,
  hint,
  children,
  className,
}: {
  id?: string;
  label: ReactNode;
  help?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {help && <PopoverHelper text={help} />}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
