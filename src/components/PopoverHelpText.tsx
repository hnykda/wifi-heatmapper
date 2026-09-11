import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** A small "i" that opens a short explanation. Keyboard and touch friendly. */
export const PopoverHelper = ({ text }: { text: string }) => {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label="More information"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-3 text-sm leading-relaxed shadow-float"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
};
