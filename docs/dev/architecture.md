# Architecture

How wifi-heatmapper is built, for people working on it. The user-facing
version (which tools run on each system, what the signal percentage means,
how the heat map is drawn) is [How it works](../guide/how-it-works.md);
setup, commands and the test suites are in
[CONTRIBUTING.md](../../CONTRIBUTING.md).

wifi-heatmapper is a Next.js app with a local backend. The server runs the
system's Wi-Fi tools (or `wifiScanner-mock.ts` with `WIFI_HEATMAPPER_MOCK=1`)
and `iperf3`, parses their output, and stores one JSON file per floor plan in
`data/surveys/` (images in `data/media/`; `WIFI_HEATMAPPER_DATA_DIR` moves
both). The desktop app runs the same server; see
[desktop-app.md](desktop-app.md).

Signal strength is stored both as RSSI (dBm) and as a percentage;
`rssiToPercentage()` and `percentageToRSSI()` in _lib/utils.ts_ convert
between them (-40 dBm = 100%, -100 dBm = 0%).
[RSSI-Percentage.xlsx](RSSI-Percentage.xlsx) has the full table.
Surveys from versions before 0.4.0 lived in the browser's localStorage;
_lib/localStorageMigration.ts_ moves them to files once.

## Platform-specific `WifiActions`

All platform-specific code is encapsulated in a `WifiActions` object
(_lib/wifiScanner-{macos,windows,linux,mock}.ts_; _lib/wifiScanner.ts_
picks one). Each function takes the `PartialHeatmapSettings` sent with the
measurement (sudo password, iperf3 server, test duration) and returns an
array (possibly empty) of `WifiResults` and a `reason`: "" when it worked,
else a human-readable message for the UI.

* `preflightSettings()` Can the Wi-Fi be read? On macOS without the Wi-Fi
  helper, and on Linux when `iw` needs it, this checks the sudo password,
  once per password value (_lib/sudo.ts_ remembers a hash of the last one
  that worked, in memory).
* `getWifi()` The current connection, as a single `WifiResults`. The
  measurement reads it three times; the network name in the progress
  header comes from it too.
* `scanWifi()` Nearby networks, sorted by signal strength, the current one
  marked `currentSSID: true`. Not used while measuring.

The speed test is not part of `WifiActions`: whether it runs is decided the
same way on every OS by _lib/speed-test.ts_ (`planSpeedTest()`), and
_lib/iperf-server-check.ts_ (`checkIperfServer()`) is the one socket check
that the server answers (in mock mode, a name containing "unreachable"
is treated as down).

## Component Hierarchy

This is a fairly standard Next.js project:

* `layout.tsx` wraps everything in `SettingsProvider`
* `page.tsx` renders `AppShell`
* `instrumentation.ts` runs `initServer()` once when the server starts
* `api` folder contains the routes
* `globals.css` holds the design tokens (light and dark) and Tailwind

`AppShell` (in `components/layout/`) draws the header with the four tabs
and the survey summary strip, and renders:

* `SettingsEditor` for updating the settings
* `Floorplan` that displays the plan, uses clicks to start the
  measurement process, and shows `MeasurementPanel` while it runs
* `Heatmaps` displays the computed heat maps
* `PointsTable` displays and edits the points collected

`SettingsProvider` (`GlobalSettings.tsx`) holds the current survey for the
UI; see [Survey files](#survey-files) for how changes reach the server.

WebGL-based heatmap rendering lives in:

* `webGL/` provides GPU-accelerated heatmap rendering
  * `renderers/` – high-level orchestration (`mainRenderer.ts`),
    layered renderers (heatmap, background)  
  * `shaders/` – vertex & fragment shader code  
  * `textures/` – LUT gradient generator  
  * `utils/` – buffer setup, program linking, default config

## Survey files

The server owns the survey files. Two pieces do the work:

* _lib/schema.ts_ has the Zod schemas, and the survey types in
  _lib/types.ts_ are derived from them.
  * `surveyFileSchema` reads a file **leniently**: a missing or damaged
    field falls back to its default (`.catch()`), an unusable point or AP
    entry is dropped, and the rest loads. All migrations happen here:
    defaults for fields older versions didn't have, `iperfResults` ->
    `iperfData` (before 0.4), the image URL derived from the name,
    only valid fixed colour scales kept (`normalizeHeatmapRanges`), and
    `measureSpeed` for files without it (`migrateMeasurementMode()`:
    a `localhost` or empty server is signal only, any other is speed).
    Unknown keys, a sudo password among them, are dropped.
  * Request bodies are **strict** (`settingsPatchSchema`,
    `addPointSchema`, `pointPatchSchema`, `deletePointsSchema`,
    `startTaskSchema`): an unknown key or a bad value is a 400 and nothing
    is written. The one exception is a point's `wifiData`/`iperfData`,
    read like a file, so a scanner that leaves a field out on some system
    still gets its measurement saved.
* _lib/survey-store.ts_ is the only code that reads or writes
  _data/surveys_. `mutate(name, fn)` reads the file, applies `fn` and
  writes it, one call at a time per file (a promise chain kept on
  `globalThis`, so every route bundle shares it). Writes go to a temp file
  that is renamed over the survey, and are stamped with `meta` (app
  version, OS, time). A file that isn't JSON is reported and left alone
  rather than overwritten. The lock is per process: one data directory is
  not meant to be shared by two servers.

The changes themselves (_lib/survey-ops.ts_) are pure functions shared by
the server and the browser: apply a settings patch (iperf3 commands and
colour scales merge per key; `null` removes a scale), add, update and
delete points.

In the browser, `SettingsProvider` keeps the survey as the server last
returned it plus the changes it hasn't answered yet, and shows that. Each
change is sent as an operation, one after another so they arrive in order;
the server answers with the whole survey, which replaces the local copy
(unchanged parts keep their identity, so maps don't redraw). Settings
changes are debounced and merged into one patch; point changes go at once.
So two tabs, or the browser and the MCP server, can change one survey
without losing each other's changes. The sudo password stays in the
browser's memory and is only sent with a measurement.

## Routes in the Next app

* _api/media/route.ts_: GET returns the list of floor plan images in
  _data/media_; POST uploads one (409 if the name is taken).
  _api/media/[name]/route.ts_: GET serves the image, DELETE removes it.
  Images are served through the API (not from _public/_) so uploads work
  with a production build.

* _api/settings/route.ts_: GET reads a survey (or lists them), PATCH
  changes settings, DELETE removes the file. POST replaces a whole survey;
  the app only uses it for the one-time localStorage migration, and it is
  kept for older clients.
  _api/surveys/[name]/points/route.ts_: POST adds a point (the server picks
  its `Point_N` id), DELETE removes points by id.
  _api/surveys/[name]/points/[id]/route.ts_: PATCH changes one point.
  Every write returns the whole updated survey. See
  [Survey files](#survey-files).

* _api/status/route.ts_: version, OS, Node, iperf3 and mock-mode details.

* _api/start-task/route.ts_ starts and stops measurements and answers for
  them; _api/events/route.ts_ streams their progress. See
  [Measurements](#measurements).

## Measurements

A measurement is a job the server owns (_lib/measurement-job.ts_):
`{ id, survey, x, y, state, progress, result, abortController }`. One runs
at a time.

* `POST /api/start-task?action=start` with `{ survey, x, y, settings }`
  starts one for that spot and answers `{ jobId }`, or 409 (with the
  running job's id) while another measures or saves. A job that was just
  cancelled gets a few seconds to finish stopping first.
* The job runs `runSurveyTests()` (_lib/iperfRunner.ts_) with the job's
  `AbortSignal`. The signal is passed to every command it runs, so
  `POST /api/start-task?action=stop` with `{ jobId }` kills a running
  iperf3 at once; the job is `cancelled` immediately, and whatever the
  measurement code returns afterwards is thrown away. A stop for another
  job id changes nothing, so a late cancel can never stop the next spot.
* When the measurement is done the job is `saving` (too late to cancel):
  the server appends the point through `survey-store.mutate()` and the job
  becomes `done` with the new point's id. The browser doesn't save it, so
  closing or reloading the tab mid-measurement loses nothing. Errors end
  in `error`, and nothing is saved. A job is stopped after 10 minutes.
* `GET /api/events` is a server-sent event stream. Every open stream (one
  per tab) gets every event: the job keeps a set of listeners. Connecting
  changes nothing about a running job; a stream that connects while one
  runs gets its latest progress at once.
* `GET /api/start-task?action=status&id=<jobId>` answers for one job
  (running or one of the last 20); without `id` it answers
  `{ job }` for the running job, or `{ job: null }`.

The last measurement and the way the Wi-Fi was read are kept for problem
reports (_lib/diagnostics-state.ts_).

In the browser, `useMeasurement` (_hooks/useMeasurement.ts_) does the
talking for `Floorplan`: a click starts a job; it follows that job's
events (and a status poll keyed by the job id, in case the stream drops)
and, on `done`, reloads the survey to show the point the server saved.
It also follows a job for the same survey that another tab started, or one
still running after a reload. `MeasurementPanel` only draws the progress.

### Measurement events

`MeasurementEvent` (_lib/types.ts_):

```typescript
{
  type: "ready" | "update" | "done" | "heartbeat";
  jobId?: string; // with survey, x, y and state: the job it belongs to
  header: string; // e.g. "Testing download speed"
  status: string; // human readable, multi-line
  fields?: { strength; tcp; udp; mode }; // what the panel shows
  warning?: string; // saved without speed, and why
  state?: "running" | "saving" | "done" | "error" | "cancelled";
  pointId?: string; // done: the saved point
}
```

* `ready` is sent when a stream connects, `heartbeat` every 5 seconds;
  neither names a job.
* `update` is progress.
* `done` ends a job; its `state` says how (`done`: saved, with
  `pointId`).

## Localization

Windows reads Wi-Fi details from the Native Wifi API (`wlanapi.dll`, see
`src/lib/wlan-api.ts`), which does not depend on the display language. The
`netsh` parsing below is only used if that API cannot be loaded or fails.

The Windows `netsh wlan ...` code is localized for the
system's language setting.
Curiously, different English systems also use slightly different
labels (e.g. "AP BSSID" vs "BSSID").
Consequently, there is no obvious algorithm for retreiving values
from the `netsh...` output.

To address this, at server startup, the _lib/localization.ts_ code
reads a set of _xxxx.json_ files to build a lookup table of
localized strings that map to the corresponding property
in a `WifiNetwork` (or null).

The Windows parsing code then retrieves each localized label from the
`netsh ...` command, does a lookup, and sets the
appropriate property.

### Creating a localization file for your System Language

To create a localization file for your Windows system's language:

* Duplicate one of the _data/localization_ files
* Rename it to _XX.json_, where "XX" is the proper code for the language
  (e.g., _fr.json_ for a French system). The exact name is not important
  except for the _.json_ suffix.
* Run these four commands from the Windows command line:
  * `netsh wlan show interfaces`
  * `netsh wlan show networks mode="bssid"`
  * `netsh wlan show profiles`
  * `netsh wlan show profile name="profile"` where
    `profile` is one of the profiles listed in the previous command
* Paste the output of the all four commands into the bottom of the new file.
* Comment out the new lines (use `//` at the start of the line),
  and remove the prior output
* Add a comment (use "//") indicating the version of Windows (Win10, Win11)
  and the system language
* In the JSON structure at the top of the file,
  replace the localized phrases from the `netsh wlan...` output
  (on the left) with the corresponding phrase on the right.
* Restart the `wifi-heatmapper` server (`npm run dev`)
  to read the new localized values
* If you have a new file, or if you have questions, create an
  [issue in the repo](https://github.com/hnykda/wifi-heatmapper/issues).

## WebGL Heatmap Rendering

Heatmaps are rendered using WebGL.

The rendering technique uses **Inverse Distance Weighted (IDW) interpolation**.
For each pixel, nearby survey points within a defined
[Radius](#radius-slider-in-heatmaps) contribute values
inversely proportional to their distance.
Closer points have more influence, while farther ones contribute less.
This creates a smooth, continuous surface representing signal
strength or throughput across the floorplan.

Values are scaled to the colour range (0..1) in JavaScript before they go
to the GPU, and clamped only after interpolation, so measurements outside a
fixed range still pull on their neighbours.

## Radius slider in Heatmaps

The heatmap takes a `radius` parameter that
determines "how much space" each survey point should occupy.
Reasonable values seem to be between 100 and 500,
and can be set by the Radius slider in the Heatmaps pane.

The current _lib/radiusCalculations.ts_ file implements a function
(named `r2`) that computes the radius using a metric related to
the density of points within the bounding box.
This seems to give pretty pleasing results.
Use the Radius slider to adjust size of the circles in the heatmap;
drag it to zero to restore the automatically calculated value.

_Note:_ There is an Android app,
[NetSpot](https://www.netspotapp.com/netspot-wifi-analyzer-for-android.html),
that incorporates a "distance" parameter for the background image.
That may give a further hint about the size of the survey points.
However, the current Radius algorithm works quite well.

