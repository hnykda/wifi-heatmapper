"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "wifi-heatmapper-theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Light / dark switch. The saved choice is applied before first paint by
 * the inline script in layout.tsx; this component just mirrors and toggles it.
 */
function rememberTheme(dark: boolean) {
  try {
    // If the choice matches the OS, forget it so the app keeps following the OS.
    if (dark === systemPrefersDark()) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // storage unavailable: the toggle still works for this page
  }
}

/** The .dark class on <html>, as a store React can subscribe to. */
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
const isDark = () => document.documentElement.classList.contains("dark");
// Unknown while rendering on the server: the button shows no icon yet
const unknownOnServer = () => null;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeToTheme, isDark, unknownOnServer);

  const toggle = () => {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    rememberTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      data-testid="theme-toggle"
    >
      {dark === null ? (
        <span className="h-4 w-4" />
      ) : dark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
