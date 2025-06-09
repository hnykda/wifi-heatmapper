import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SettingsProvider } from "@/components/GlobalSettings";
import { initServer } from "../lib/server-init";

const inter = Inter({ subsets: ["latin"] });

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
        <body className={inter.className}>{children}</body>
      </SettingsProvider>
    </html>
  );
}
