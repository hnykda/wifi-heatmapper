---
title: Measuring speed with iperf3
description: Add TCP and UDP throughput, jitter and packet loss to every measurement.
order: 4
---

# Measuring speed with iperf3

Signal strength alone tells you where the Wi-Fi is weak. Throughput tells
you how fast it actually is. Wi-Fi Heatmapper measures it with
[iperf3](https://iperf.fr), which needs two computers: the laptop you walk
around with, and a second one on your network that stays put.

## Set it up

1. Install `iperf3` on the laptop. Homebrew (on a Mac) and the Linux `.deb`
   do this for you. On Windows, install it so it is on your `PATH`, for
   example `scoop install iperf3` or `choco install iperf3`; the app also finds
   iperf3 installed by winget. `iperf3 --version` should work in a terminal.
   Tools called `iperf` or `iperf2` are different and incompatible.
2. Install `iperf3` on another computer on your network, wired if possible
   (a desktop, a Raspberry Pi, a NAS), and start it with `iperf3 -s`.
3. In Settings, enter that computer's address (or `host:port`) as the iperf3
   server. Leave it at `localhost` to measure signal strength only.

A version newer than 3.17 is recommended on both ends, ideally the same one.
On Windows, running from source, you may need to add iperf3's folder to `PATH` yourself
(`setx PATH "%PATH%;C:\iperf3"`) and open a new terminal.
If iperf3 is not installed on the laptop, set the server back to `localhost`
to measure signal strength only.

## What each measurement runs

With a server set, every spot runs TCP and UDP tests in both directions,
reading the Wi-Fi signal before, between and after them:

| Test | Heat maps you get |
|---|---|
| TCP download, TCP upload | throughput (Mbps), retransmits (download) |
| UDP download, UDP upload | throughput (Mbps), jitter (ms), lost packets, packets received |

**Test duration** in Settings sets the seconds per test; one second is enough
for a survey. The exact commands are editable under **iperf3 commands** in
Settings; `{server}`, `{port}` and `{duration}` are filled in from the
settings above.

## Comparing before and after

Use **Colour scales** on the **Heat maps** tab to fix the lower and upper
value of each map, for example TCP download 0–500 Mbps and UDP upload jitter
0–20 ms. Use the same ranges in your before and after surveys (say, before
and after adding a mesh node) and the colours mean the same numbers. Ranges
are saved with each survey and used in downloaded maps. See
[heat maps](using-the-app.md#heat-maps) for units and details.
