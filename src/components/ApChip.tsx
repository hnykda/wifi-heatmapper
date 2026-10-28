import { cn } from "@/lib/utils";

/** An access point as a small tag, tinted with its hue (lib/apName.ts apHues). */
export function ApChip({
  hue,
  mono = false,
  className,
  children,
}: {
  hue: number | undefined;
  /** a BSSID rather than a name */
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "ap-chip inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium",
        mono && "font-mono",
        className,
      )}
      style={{ "--ap-hue": hue ?? 220 } as React.CSSProperties}
      data-testid="ap-chip"
    >
      {children}
    </span>
  );
}
