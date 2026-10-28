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
that implements the following functions.
These functions take a parameter of `PartialHeatmapSettings` that includes
sudo password, iperf server address, and test duration.
All the functions return an array (possibly empty) of `WifiResults`
and "" for a successful operation or
a human readable error message suitable for display in the user interface.

* `preflightSettings()` Check all the settings to see if the test
  can proceed. Return a human-readable error message if not.
* `checkIperfServer()` Check that the iperf3 server is reachable,
  or return an error message.
* `findWifiInterface()` Return the platform-specific name of the wifi interface
* `scanWifi()` Return an array of SSIDs "in the neighborhood",
  sorted by signal strength.
  The current SSID (whether the strongest or not)
  is marked with `{ currentSSID: true }`
  _This may be useful for showing when the strongest SSID is not the
  SSID currently in use._  
* `setWifi()` Change the current SSID to use a new SSID, specified in the
  additional `newWifiSettings` parameter.
  _NB: This function was (partially) implemented on macOS,
  but does not work on modern versions of macOS (15+).
  The problem is that user-level code cannot change the SSID
  without a credential check for **every** new change.
  That constraint is unworkable: that effort has been abandonded for now._  
* `getWifi()` Return the array with a single `WifiResults` with all the
  information for the current SSID.  

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

`SettingsProvider` (`GlobalSettings.tsx`) owns the current survey and
writes it to `/api/settings` shortly after each change.

WebGL-based heatmap rendering lives in:

* `webGL/` provides GPU-accelerated heatmap rendering
  * `renderers/` – high-level orchestration (`mainRenderer.ts`),
    layered renderers (heatmap, background)  
  * `shaders/` – vertex & fragment shader code  
  * `textures/` – LUT gradient generator  
  * `utils/` – buffer setup, program linking, default config

## Routes in the Next app

* _api/media/route.ts_: GET returns the list of floor plan images in
  _data/media_; POST uploads one (409 if the name is taken).
  _api/media/[name]/route.ts_: GET serves the image, DELETE removes it.
  Images are served through the API (not from _public/_) so uploads work
  with a production build.

* _api/settings/route.ts_: reads, writes, lists and deletes the survey
  files in _data/surveys_. The server stamps each saved file with
  `meta` (app version, OS, time) and never writes the sudo password.

* _api/status/route.ts_: version, OS, Node, iperf3 and mock-mode details.
  
* The _api/events/route.ts_ file listens for a GET request,
  then keeps open a connection that sends
  `sseMessageType` events to the client.
  These indicate the progress of the measurement or
  that the measurement had been cancelled.
  
* The _api/start-task/route.ts_ file listens for a POST
  to start or end the measurement process.
  The parameter is `action=start|stop`.
  The `start` action causes a new measurement process to begin.
  The `stop` action cancels the measurement process and returns
  a `done` `sseMessage` containing "canceled".
  
## How the GUI and server communicate

When an empty space is clicked, the `Floorplan` component
triggers the measurement process
and displays the progress of the measurements.

* A click in the Floorplan initiates a test with a
  POST _api/start=task/action=start_
  that immediately returns an "OK" response and
  in parallel starts an IIFE on the server that ultimately calls
  `runSurveyTest()`
  
* The Floorplan also polls once per second with
  GET _/api/start-task?action=results_.
  The result is a `SurveyResult` that contains `wifiData`, `iperfData`,
  and a `state`.
  When the returned `state` is "done", the rest of the results
  contain the information about the measurement.

* A click on the Floorplan also opens the `MeasurementPanel` component.
  It issues GET _/api/events_ that starts a stream of
  Server Sent Events with `sendToClient()`
  that is registered in the global _server-globals.ts_ module.
  Those events contain the progress shown in the panel.
  When the stream reports `ready`, the Floorplan starts the measurement.

* The panel also has a **Cancel** button that aborts the measurement
  process by issuing POST _/api/start-task?action=stop_
  This calls global `setCancelFlag(true)`.
  The server's measurement process notices this and halts the process
  with appropriate status updates.
  
_NB: Why are there two separate processes - SSE and polling within Floorplan?
They could have been combined into a single mechanism.
However, the SSE process was initially implemented,
but subsequent changes (turning Wi-Fi off and on) disrupted the SSE stream.
So now Floorplan polls for the status in parallel with the SSE stream.
wifi-heatmapper no longer turns off the Wi-Fi, but we leave both in place._
  
## Server-Sent Events - sseMessage

The server sends [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
to the client.
SSEs have these fields:

```javascript
export type SSEMessageType = {
  type: string;//ready, update, done, info
  header: string;
  status: string; 
};
```

* `ready` signals NewToast to tell its parent to
  begin the measurements
* `update` simply provides updated header and status messages
* `done` updates the header and status, then starts a timer to
  remove the NewToast after several seconds.
* `info` is a general message - ignored by NewToast

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

