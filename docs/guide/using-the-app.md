---
title: Using the app
description: Every tab and setting: floor plans, measuring, heat maps and colour scales, survey points.
order: 3
---

# Using the app

wifi-heatmapper has four sections, shown as tabs in the header. The strip
under the header always shows which floor plan you are working on, how many
points it has, and what it measures: **Signal only**, or **Signal and speed**
with the server's address. In a speed survey it also warns when no server is
set or the newest point was saved without speed.

The header also has a light/dark switch and an "i" button that opens the
About dialog with the version, OS and iperf3 details. The **?** in the
bottom-right corner opens the guide for the tab you are on, what's new, and
**Report a problem**, which fills in a bug report for you (see the
[FAQ](faq.md#something-went-wrong-how-do-i-report-it)).

The first time you open the app a short welcome message explains the
workflow. "Got it" hides it for good; the About dialog can show it again.

## Settings

![Settings](../images/settings.png)

* **Floor plan** – the image you click on. Choose one of the bundled plans or
  upload a PNG, JPEG or WebP. Each floor plan keeps its own survey in
  `data/surveys/<name>.json`. The trash button deletes the image and its
  survey.
* **Settings from another survey** – **Copy settings from…** copies settings
  of another floor plan's survey into this one. Pick the survey, then tick
  what to copy:
  * **Speed settings** (ticked to start with) – what to measure, the speed
    test server, the test duration and extra iperf3 options;
  * **Access point names**;
  * **Heat map look** – spot size, opacity, colours and the fixed colour
    scales set on the Heat maps tab. The spot size is in floor-plan pixels,
    so it fits best between images of a similar size.

  The points, the floor plan image and its size are never copied, and
  neither is the sudo password.
* **What to measure** – **Signal only** (nothing to set up, about 2 seconds
  per spot) or **Signal and speed** (needs iperf3 on this computer and on a
  second one, about 6 to 10 seconds per spot). Each survey keeps its own
  choice. A new survey starts with the speed settings (what to measure,
  server, duration and commands) of the survey you saved last, and says so
  under **Measurement**: "Speed settings copied from …". The very first
  survey starts with signal only. See
  [signal only or with speed?](getting-started.md#signal-only-or-with-speed)
  The settings below appear only for speed:
  * **Speed test server (uses iperf3)** – the address of the second computer,
    which runs `iperf3 -s`: `192.168.1.10`, `nas.local`, `host:port` or
    `[IPv6]:port`.
  * **Test connection** and the checklist under it – whether iperf3 is
    installed on this computer and whether the server answers, plus a
    reminder to wire the server to the router.
  * **Test duration** – seconds per test. One second is enough for a survey.
  * **Advanced: iperf3 options** – extra iperf3 options for each test,
    separated by spaces, such as `-P 4` (four parallel streams). The app
    sets the server, port, duration, download/upload and TCP/UDP itself; the
    field shows the whole command. Surveys from before 0.8 stored whole
    commands; their extra options are kept, and a command with shell syntax
    (pipes, `;`, redirects) is replaced by the defaults.
* **sudo password** – required on macOS and Linux to read the signal. Kept in
  memory only; never written to disk. Not shown on Windows, in Docker, or in
  mock mode.
* **Access point names** – optional names for access points, by MAC address
  (BSSID), shown instead of the address in point details, the table and the
  CSV export. End a MAC
  address with `*` (for example `aa:bb:cc:dd:ee:*`) to name every BSSID that
  starts with it, such as the per-band BSSIDs of one access point. An exact
  MAC address wins over a prefix, and a longer prefix wins over a shorter one.
* **Heat map colours** – the colour stops for signal strength (0% = -100 dBm,
  100% = -40 dBm) and the opacity range of the overlay.

## Floor plan

![Floor plan](../images/floorplan.png)

Stand where you want to measure and click that spot. A pulsing dot marks the
spot while the measurement runs; the panel in the corner shows progress and
has a Cancel button. In a signal-only survey it shows the signal and "Speed:
not measured (signal only)"; with speed it shows download / upload and the
fixed-rate (UDP) results as they come in. When it finishes, the dot is
coloured by signal strength and labelled with the percentage.

The app's server takes the measurement and saves the point, so closing or
reloading the page while it runs doesn't lose it: open the app again and
the point is there (a page opened meanwhile shows the progress too).
Cancel stops at once, even in the middle of a speed test, and nothing is
saved. One measurement runs at a time; other open pages of the same survey
show its progress.

If the survey measures speed but the speed test could not run (iperf3 not
installed, no server, server not answering), the point is still saved: the
panel says **Saved without speed**, gives the reason and stays open until you
dismiss it. See [when the speed test can't run](throughput.md#when-the-speed-test-cant-run).

Click a dot to see its details, switch it off (it is then ignored by the heat
maps) or delete it.

On Linux, measurements use the first connected managed Wi-Fi interface,
ignoring monitor, AP and P2P devices. If the link is disconnected or its
signal information is incomplete, the measurement reports an error instead
of saving an empty reading.

In mock mode, "Add sample points" fills the plan with synthetic points.

## Heat maps

![Heat maps](../images/heatmaps.png)

Tick the measurements you want to see. By default, signal strength uses a
0–100% scale; other measurements run from 0 to each map's maximum.

The **Speed** maps (download speed, upload speed and the fixed-rate UDP
tests) appear once at least one point has a speed reading. Until then a line
under the list says the survey measures signal only, with a link to
Settings. **Speed detail** picks what each speed map shows: speed in Mbps,
jitter (variation in delay), lost or received packets, or resent data
(retransmits).

**Signal-to-noise ratio** (RSSI minus the noise floor, in dB; 0–50 dB by
default, higher is better) uses only points with a noise reading. macOS and
Linux drivers that report noise in `iw dev <interface> survey dump` record it;
Windows does not, so the option is greyed out for surveys without noise.

Under **Colour scales**, turn on a fixed scale for a map and edit its
**Lower** and **Upper** values. Each map has independent bounds: download,
upload and the two fixed-rate (UDP) tests do not share ranges, even for the
same parameter. Signal strength has its own range too. The first time you
enable a fixed scale, it freezes that map's current automatic range. While a
field is empty or invalid, the last valid range stays active. Use identical ranges in your before and after
surveys to compare them. Ranges are saved with each survey.

Speed bounds use Mbps, jitter uses ms, packet values use counts, and
signal bounds use percent even when its legend shows dBm. The map, legend
and downloaded PNG all use the chosen range. Values outside it use the
endpoint colours; measurements are unchanged. Green represents higher
values, so lower jitter, packet loss and retransmits are better even though
they appear toward the red end. Turn off the fixed scale to restore automatic
scaling. Your saved bounds are retained while off, including across reloads;
turning it on again restores them rather than freezing a new automatic range.

**Radius** controls how far each point's influence reaches. It starts at an
automatic value based on how spread out your points are; drag it until
neighbouring spots merge into one surface.

Hover a map to enlarge or download it. Downloaded PNGs include the legend and
a caption with the floor plan name, point count and date.

## Survey points

![Survey points](../images/points.png)

Every measurement in the survey. Sort by any column, show more columns
(signal in dBm, channel, Wi-Fi standard, coordinates, and more), filter,
switch points off, delete a selection, or export everything as CSV. The
download and upload columns appear once a point has a speed reading.
