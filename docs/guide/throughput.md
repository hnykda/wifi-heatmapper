---
title: Measuring speed
description: Add download and upload speed to every measurement, with a second computer running iperf3.
order: 4
---

# Measuring speed

Signal strength tells you where the Wi-Fi is weak. Speed tells you how fast
it actually is where you stand. A strong signal is not always fast:
interference, a busy channel or a slow link between mesh nodes can make a
spot slow that looks fine on the signal map. Technically the app measures
*throughput*, the amount of data that gets through per second, in Mbps.

To measure speed, choose **Signal and speed** under **What to measure** in
Settings. The choice is saved with each survey, so one floor plan can measure
signal only and another signal and speed.

## The second computer

A speed test needs something to send data to and receive it from. Wi-Fi
Heatmapper uses [iperf3](https://iperf.fr), a free tool, on two computers:

* **This laptop**, the one you walk around with. The app runs iperf3 here.
* **A second computer** on your network that stays put while you survey: a
  desktop, a Raspberry Pi or a NAS. It runs `iperf3 -s` (the "speed test
  server") and waits.

**Connect the second computer to the router with a cable.** Then the test
measures only the Wi-Fi between the laptop and the router. If the server is
on Wi-Fi too, every test crosses the air twice and the results come out at
roughly half, and they vary with where the server is.

Each spot tests **both directions**: download (server to laptop) and upload
(laptop to server). Wi-Fi is often slower in one direction than the other,
for example when the laptop's antennas are weaker than the router's.

## Set it up

1. Install iperf3 on this laptop. Homebrew (on a Mac) and the Linux `.deb`
   do this for you. On Windows, install it so it is on your `PATH`, for
   example `scoop install iperf3` or `choco install iperf3`; the app also finds
   iperf3 installed by winget. `iperf3 --version` should work in a terminal.
   Tools called `iperf` or `iperf2` are different and incompatible.
2. Install iperf3 on the second computer and start it with `iperf3 -s`.
3. In Settings, choose **Signal and speed** and enter the second computer's
   address as the **Speed test server**: `192.168.1.10`, `nas.local`, or with
   a port, `192.168.1.10:5201`. IPv6 works too: `[fe80::1]:5201`, or a bare
   address without a port. The port defaults to 5201.
4. Click **Test connection**. The checklist under the field shows whether
   iperf3 is installed on this computer and whether the server answers.

A version newer than 3.17 is recommended on both ends, ideally the same one.
On Windows, running from source, you may need to add iperf3's folder to
`PATH` yourself (`setx PATH "%PATH%;C:\iperf3"`) and open a new terminal.

## When the speed test can't run

The signal is always saved. If iperf3 is not installed on this laptop, no
server is set, or the server does not answer, the app skips the speed test,
saves the signal reading, and says so: the panel in the corner shows **Saved
without speed** with the reason instead of a green tick, and the strip under
the header warns that the newest point has no speed. The same happens if a
test fails part way, for example because the server is busy with another
test. This works the same on macOS, Windows and Linux.

Fix the cause (start `iperf3 -s`, check the address, or open port 5201 in the
server's firewall) and measure the spot again, or switch the survey back to
**Signal only**.

## What each spot runs

With speed on, every spot runs four short tests, reading the Wi-Fi signal
before, between and after them:

| Test | Heat maps you get |
|---|---|
| Download and upload speed (TCP) | speed in Mbps; resent data (retransmits) for download |
| Fixed-rate download and upload (UDP) | speed in Mbps, jitter (variation in delay, ms), lost packets, packets received |

The download and upload tests send as fast as the connection allows. The
fixed-rate tests send at a steady rate and show how evenly the data arrives,
which matters for calls and games.

**The fixed-rate (UDP) tests are capped at 100 Mbps** by `-b 100M` in their
extra iperf3 options, which is safe on most networks. If your UDP results sit at exactly
100 Mbps, the connection can do more: raise the cap under **Advanced:
iperf3 options**, for example to `-b 500M`.

**Test duration** sets the seconds per test, 3 by default, so a spot takes
about 15 seconds in all. One second (about 6 to 10 seconds a spot) is
quicker, but a connection takes a moment to reach full speed, so short
tests read low and vary more. Longer tests give steadier numbers. Extra iperf3 options per test (for example `-P 4` for
parallel streams, or the UDP cap) go under **Advanced: iperf3 options** in
Settings; the server, port and duration come from the settings above.

## Comparing before and after

Use **Colour scales** on the **Heat maps** tab to fix the lower and upper
value of each map, for example download speed 0–500 Mbps and fixed-rate
upload jitter 0–20 ms. Use the same ranges in your before and after surveys
(say, before and after adding a mesh node) and the colours mean the same
numbers. Ranges are saved with each survey and used in downloaded maps. See
[heat maps](using-the-app.md#heat-maps) for units and details.
