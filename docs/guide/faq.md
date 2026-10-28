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

You can edit a survey file by hand. A value the app can't use falls back to
its default and the rest still loads; a file that isn't valid JSON is left
as it is (the app says it can't read it) until you fix or delete it. Having
the same survey open in two tabs is fine: each change is saved on its own,
so neither tab undoes the other.

## Can I try it without a Wi-Fi card, sudo or iperf3?

Yes: from source, `npm run dev:mock` runs the app with synthetic
measurements. Useful for looking around, taking screenshots, or working on
the app.

## Is it really free?

Yes. The app is MIT licensed and has no ads, accounts or paid tier. If it
helped you, star the
[repository](https://github.com/hnykda/wifi-heatmapper) so others find it, or
[help out](https://wifi-heatmapper.danielalder.cz/#contribute).

## Does it send anything?

Only anonymous usage counts: that it was installed, that it started (at most
once a day) and that a measurement was saved, with the app version, the
system and how the app runs. Never network names, addresses, results or
anything from your surveys. I build the app on my own, and these counts tell
me whether people actually use it. Turn them off in Settings > Usage counts,
or with `WIFI_HEATMAPPER_TELEMETRY=0` or `DO_NOT_TRACK=1`.
[Privacy and usage counts](privacy.md) lists every field.

## Something went wrong. How do I report it?

Please do. Wi-Fi works differently on every system and version (macOS
needs Location access and changes what it reports from one release to the
next, Windows versions differ in what they share, Linux drivers each
report a little differently), and the developers can't test them all. Reports like yours
are how it gets fixed.

The quickest way is from the app:

1. Click the **help button** (the **?** in the bottom-right corner) and
   choose **Report a problem**. When a measurement fails (**Could not
   measure**) or a point is **Saved without speed**, the panel has a
   **Report this** link that adds the reason; error messages have one too.
2. The dialog shows exactly what would be shared: the app version, your
   system and version, how the app runs (desktop app, from source, Docker,
   mock mode), how it reads Wi-Fi on your system (for example the macOS
   Wi-Fi helper, `wdutil`, `iw` or the Windows WLAN API), whether
   iperf3 is installed, whether the survey measures signal only or signal
   and speed, the last measurement and why it failed or had no speed,
   and the last few hundred lines of the app's log.
3. Click **Open GitHub issue**. GitHub opens in your browser with the form
   filled in; add what you did and what you expected, check it, and submit.
   Nothing is sent before you do. If the report is too long for a link, the
   app copies it, and the issue asks you to paste it. **Copy diagnostics**
   copies it too, for anywhere else.

What is left out:

- **Your sudo password, always.** It is removed from everything, including
  the commands in the log.
- **Network names, access point (MAC) addresses and IP addresses**, unless
  you switch on **Include network names and addresses**. They are replaced
  with placeholders such as `<ssid-1>`, `<mac-1>` and `<ip-1>`; the same
  network gets the same placeholder throughout, so the report still shows
  when something changed. Your computer's name is hidden too, and your home
  folder shows as `~`.

The log in the report is what the app printed at its current log level. For
more detail, run it with `LOG_LEVEL=2` (see [logs](run-from-source.md#logs)),
repeat what went wrong, and report again. Without the app, open an
[issue](https://github.com/hnykda/wifi-heatmapper/issues/new?template=bug_report.yml)
and fill the form in by hand; the desktop app's log files are listed in
[Installing the app](install.md).

Tried a desktop app? Tell us how it went, even if it just worked, with the
[desktop app report](https://github.com/hnykda/wifi-heatmapper/issues/new?template=desktop-app-report.md).
