# FAQ

1. **How can I create a floor plan for my home?**  
   If you have one, upload an existing floor plan for your home.
   You can also use Google Maps, and take a screenshot of your home.
   make a sketch on paper.
   Use your phone or laptop to photograph the image, then upload it.

   Heat maps are inherently approximate, so the floor plan doesn't
   need to be perfect or "to scale".
   Just make it reasonably close, upload it, and
   start clicking on the **Floor Plan** tab.

2. **Why do I see `<redacted>`or `000000000000` instead of
  an SSID or address?**  
   Apple has changed the security mechanism in macOS 15 and later.
   Even with sudo access, the SSID and BSSID are no longer available.
   It appears that a macOS application now needs Location Access
   permissions to obtain this information.

## Where is my data?

In `data/surveys/<floor plan name>.json` next to the app, one file per floor
plan, plus the images in `data/media/`. Copy the `data` folder to back up or
move a survey. Set `WIFI_HEATMAPPER_DATA_DIR` to keep it elsewhere.

## Can I try it without a Wi-Fi card, sudo or iperf3?

Yes: `npm run dev:mock` runs the app with synthetic measurements. Useful for
looking around, taking screenshots, or developing the UI.
