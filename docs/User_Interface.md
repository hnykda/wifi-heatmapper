# User Interface

wifi-heatmapper has four sections, shown as tabs in the header. The strip
under the header always shows which floor plan you are working on, how many
points it has, and whether throughput tests are on.

The header also has a light/dark switch and an "i" button that opens the
About dialog with the version, OS and iperf3 details to include in bug reports.

The first time you open the app a short welcome message explains the
workflow. "Got it" hides it for good; the About dialog can show it again.

## Settings

![Settings](images/settings.png)

* **Floor plan** – the image you click on. Choose one of the bundled plans or
  upload a PNG, JPEG or WebP. Each floor plan keeps its own survey in
  `data/surveys/<name>.json`. The trash button deletes the image and its
  survey.
* **iperf3 server** – address (or `host:port`) of a computer running
  `iperf3 -s`. Leave it at `localhost` to measure signal strength only.
* **Test duration** – seconds per iperf3 test. One second is enough for a
  survey.
* **sudo password** – required on macOS and Linux to read the signal. Kept in
  memory only; never written to disk. Not shown on Windows, in Docker, or in
  mock mode.
* **Access point names** – optional names for BSSIDs, shown instead of the
  MAC address in point details and the table.
* **Heat map colours** – the colour stops for signal strength (0% = -100 dBm,
  100% = -40 dBm) and the opacity range of the overlay.
* **iperf3 commands** – the exact commands run for each test.
  `{server}`, `{port}` and `{duration}` are filled in from the settings above.

## Floor plan

![Floor plan](images/floorplan.png)

Stand where you want to measure and click that spot. A pulsing dot marks the
spot while the measurement runs; the panel in the corner shows progress and
has a Cancel button. When it finishes, the dot is coloured by signal strength
and labelled with the percentage.

Click a dot to see its details, switch it off (it is then ignored by the heat
maps) or delete it.

In mock mode, "Add sample points" fills the plan with synthetic points.

## Heat maps

![Heat maps](images/heatmaps.png)

Tick the measurements you want to see. By default, signal strength uses a
0–100% scale; other measurements run from 0 to each map's maximum.

Under **Colour scales**, turn on a fixed scale for a map and edit its
**Lower** and **Upper** values. Each map has independent bounds: TCP download,
TCP upload, UDP download and UDP upload do not share ranges, even for the
same parameter. Signal strength has its own range too. The first time you
enable a fixed scale, it freezes that map's current automatic range. While a
field is empty or invalid, the last valid range stays active. Use identical ranges in your before and after
surveys to compare them. Ranges are saved with each survey.

Throughput bounds use Mbps, jitter uses ms, packet values use counts, and
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

![Survey points](images/points.png)

Every measurement in the survey. Sort by any column, show more columns
(RSSI, channel, PHY mode, coordinates, and more), filter, switch points off,
delete a selection, or export everything as CSV.
