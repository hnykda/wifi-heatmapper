import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const PopoverHelper = ({ text }: { text: string }) => {
  return (
    <Popover>
      <PopoverTrigger>
        <Info className="w-4 h-4 relative top-0.5" />
      </PopoverTrigger>
      <PopoverContent>{text}</PopoverContent>
    </Popover>
  );
};
