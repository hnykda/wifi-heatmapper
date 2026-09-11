import type { Metadata } from "next";

import "./globals.css";
import { SettingsProvider } from "@/components/GlobalSettings";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Wi-Fi Heatmapper",
  description:
    "Measure Wi-Fi signal strength and throughput around your home or office and draw heat maps on your floor plan.",
  icons: { icon: "/favicon.ico" },
};

/**
 * Applies the saved theme before first paint so there is no flash.
 * "system" (the default) follows the OS setting.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("wifi-heatmapper-theme");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <SettingsProvider>{children}</SettingsProvider>
        <Toaster />
      </body>
    </html>
  );
}
