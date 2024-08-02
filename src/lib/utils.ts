import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Database } from "@/lib/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getDefaults = (): Database => {
  return {
    surveyPoints: [],
    floorplanImage: "",
    iperfServer: "",
    apMapping: [],
    testDuration: 10,
  };
};

export const formatMacAddress = (macAddress: string) => {
  return macAddress.replace(/../g, "$&-").toUpperCase().slice(0, -1);
};
