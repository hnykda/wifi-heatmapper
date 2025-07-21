import type { Metadata } from "next";

import "./globals.css";
import { SettingsProvider } from "@/components/GlobalSettings";
import { initServer } from "../lib/server-init";

export const metadata: Metadata = {
  title: "WiFi Heatmapper",
  description: "A tool to measure WiFi signal in a floorplan.",
};

await initServer(); // fire up all the server-side stuff

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <SettingsProvider>
        <body>{children}</body>
      </SettingsProvider>
    </html>
  );
}
