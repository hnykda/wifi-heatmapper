---
title: FAQ
description: Floor plans, hidden network names on macOS, backups, and how to report a problem.
order: 7
---

# FAQ

## How do I make a floor plan?

Upload an existing plan of your home if you have one. Otherwise take a
screenshot of your building from a map, or sketch it on paper and photograph
it with your phone. Settings accepts PNG, JPEG and WebP.

Heat maps are approximate by nature, so the plan does not need to be perfect
or to scale. Reasonably close is enough: upload it and start clicking on the
**Floor plan** tab.

## How many points do I need?

One or two per room, more in big rooms, and a few near the outer walls and
in the places you actually use Wi-Fi (desk, sofa, garden). Gaps between points
are filled in by the heat map, so even coverage matters more than many points.

## Why do I see `<redacted>` instead of a network name?

macOS 15 and later only give apps the network name (SSID) and access point
address (BSSID) if they have Location access. In the desktop app, click
**Allow Location access** in Settings and **Allow** in the macOS dialog. When
running from source, build the Wi-Fi helper first
(`npm run build:macos-helper`), then do the same. The helper uses the
permission only to see the network name; it never looks up where you are.
`000000000000` instead of an address has the same cause.

## Where is my data?

One JSON file per floor plan, plus the images. In the desktop app:

- macOS: `~/Library/Application Support/com.github.hnykda.wifi-heatmapper/data`
- Windows: `%LOCALAPPDATA%\com.github.hnykda.wifi-heatmapper\data`
- Linux: `~/.local/share/com.github.hnykda.wifi-heatmapper/data`

From source it is `data/` in the repository. Copy that folder to back up or
move a survey. Set `WIFI_HEATMAPPER_DATA_DIR` to keep it elsewhere.

## Can I try it without a Wi-Fi card, sudo or iperf3?

Yes: from source, `npm run dev:mock` runs the app with synthetic
measurements. Useful for looking around, taking screenshots, or working on
the app.

## Is it really free?

Yes. The app is MIT licensed, has no ads, accounts or paid tier, and sends
nothing anywhere. If it helped you, star the
[repository](https://github.com/hnykda/wifi-heatmapper) so others find it, or
[help out](https://wifi-heatmapper.danielalder.cz/#contribute).

## Something went wrong. How do I report it?

Open an [issue](https://github.com/hnykda/wifi-heatmapper/issues/new/choose).
Include the details from the About dialog (the "i" button in the header) and,
if you can, a log: in the desktop app the log paths are in
[Installing the app](install.md); from source, see
[logs](run-from-source.md#logs).

Tried a desktop app? Tell us how it went, even if it just worked, with the
[desktop app report](https://github.com/hnykda/wifi-heatmapper/issues/new?template=desktop-app-report.md).
