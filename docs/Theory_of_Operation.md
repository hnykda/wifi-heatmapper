# Theory of operation

**wifi-heatmapper** is a Next.js app that uses to a local backend server
to measure both Wi-Fi signal strength and
(optionally) TCP and UDP speeds to an `iperf3` server
at various locations.
It produces a heat map for each set of
measurement points ("surveyPoints")
that show where signal/throughput are high and low.

## Tests before a release

There are a number of tests to run before making
a new **wifi-heatmapper** release.
The entire code base should pass all tests with no warnings or errors.
These include:

* `npm run typecheck` - run the Typescript compiler on all files
* `npm run lint` - run the linter on all files
* `npm test` - run all the test cases

## How wifi-heatmapper works

To get information about the Wi-Fi signal and other parameters,
**wifi-heatmapper** invokes
the commands below via JS `child_process` and parses the output.
The webapp then just stores everything in simple JSON
"database" file in localStorage().

## Platform-Specific Commands

**wifi-heatmapper** runs the following CLI commands:
they must be installed on your computer
to make the measurements of Wi-Fi strength and throughput.

| Platform | Commands          | Notes                                                                                                                                                    |
| -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | `wdutil`, `ioreg`, `system_profiler` | sudo password is needed for `wdutil`                                             |
| Windows  | `netsh`           | Part of the system  |                                                                                       
| Linux    | `nmcli`, `iw`     | `iw` might need to be installed via your distro package manager. wifi-heatmapper infers the device id of the wireless device (e.g. "wlp4s0"). |
| All | `iperf3` | See note below |

**iperf3** must be installed locally to make TCP or UDP measurements.
(If it is not installed, those measurements will be skipped.) 
A version greater than 3.17 is recommended for both server and client
(ideally the same version, but that's not strictly necessary). 
It also must be available in `PATH`.
For Windows you might have to set the path
`set PATH=%PATH%;C:\path\to\iperf3`, e.g. do `set PATH=%PATH%;C:\iperf3` (or `setx` to make it permanent) before running `npm run dev`.

## Platform-specific `WifiActions`

All platform-specific code is encapsulated in a `WifiActions` object
that implements the following functions.
All functions take a parameter of `PartialHeatmapSettings` that include
sudo password, iperf server address, and test duration.
All the functions return an array (possibly empty) of `WifiResults`
and a human readable error message suitable for display in the user interface or "" for a successful operation.

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
  This is unworkable: that effort has been abanonded for now._  
* `getWifi()` Return a single `WifiResults` with all the information
  available for the current SSID.  

## Running with higher LOG_LEVEL

You can use `LOG_LEVEL=<number from 0 to 6>` to control logging, where the levels are `0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal`. Use this when submitting the bug reports.

## Component Hierarchy

This is a fairly standard Next.js project:

* `page.tsx` defines the top level _App()_ component
* `layout.tsx` buttresses it, and also provides a hook for
  global initialization code
* `api` folder contains the routes
* `global.css` uses TailwindCSS for styling the components

The _App()_ in `page.tsx` returns two major GUI components:

* `SettingsProvider` that initializes and passes all the settings
  to its children
  * `TabPanel` that contains each of these four components
    * `SettingsEditor` for updating the settings
    * `Floorplan` that displays the plan, and uses clicks to start
      the measurement process
    * `Heatmaps` displays the computed heat maps
    * `PointsTable` displays and edits the points collected

WebGL-based heatmap rendering lives in:

* `webGL/` provides GPU-accelerated heatmap rendering 
  * `renderers/` – high-level orchestration (`mainRenderer.ts`), layered renderers (heatmap, background)  
  * `shaders/` – vertex & fragment shader code  
  * `textures/` – LUT gradient generator  
  * `utils/` – buffer setup, program linking, default config

## Routes in the Next app

* The _api/media/route.ts_ file listens for a GET request
  and returns the list of files in the _public/media_ directory.
  A POST request is treated as a file upload to be saved
  in that directory.
* The _api/events/route.ts_ file listens for a GET request,
  then keeps open a connection that sends 
  `sseMessageType` events to the client.
  These indicate the state of the measurement, or a Cancel event.
* The _api/start-task/route.ts_ file listens for a POST
  to start or end a server-side task.
  The parameter is `action=start|stop`.
  At this time, the `start` action is not used.
  The `stop` action cancels the measurement process and returns
  a `done` `sseMessage` containing "canceled".
* NB: The measurement process on the sever is initiated
  by the client directly calling the server side 
  `measureSurveyPoint()` function.
  It's likely this could also have been triggered by
  `action=start` but the direct call predated the SSE code.

## How the Toast progress notifier works

When an empty space is clicked, the `Floorplan` component
triggers the measurement process
and displays the progress of the measurements.
Those updates are provided by Server-Sent Events (see below),
which is an astonishingly complicated process:

* A click on `Floorplan` sets `toastIsOpen` true.
* The `NewToast` component is "conditionally rendered"
  (because it is rendered with `{toastIsOpen && <NewToast... />}`)
  The child component builds a connection to the server by calling
  `/api/events` and listens for status updates on that connection.
* The _/api/events/routes.ts_ server module
  fields that GET request,
  creates the `sendToClient()` function for sending updates,
  and registers that function in the global _sseGlobal.ts_ module.
  All server-side clients can import and use that function.
* When `NewToast` receives a "ready" message from the server,
  it calls back to the `Floorplan` with `toastIsOpen()`
* That triggers the actual measurement process that uses `sendToClient()`
  to send updates to `NewToast`.
* Clicking the Cancel button of `NewToast`
  sends a POST to _/api/start-task?action=stop_.
  This calls global `setCancelFlag(true)`.
  The server's measurement process notices this and halts the process
  with appropriate status updates.
  
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
  remove the NewToast after a number of seconds.
* `info` is a general message - ignored by NewToast

## RSSI and Signal Strength

The percentage signal strength (0-100%) is an intuitive measure
of the Wi-Fi signal.
Some OS utilities provide it as a percentage, others use "dBm".
The `rssiToPercentage()` and `percentageToRSSI()` functions
in _lib/utils.ts_ convert from one to the other.
At the end of each measurement, the code saves both values.

NB: In practice, any value below -75 dBM (~ 40%) is too low
to be useful, and the color displayed in the heatmap
is correspondingly discouraging (yellow, red).

Arguably, the zero point of the percentage scale should be
-90dBm (not -100dBm) since the noise floor
(at which background noise swamps the WiFi signal)
frequently sits around -90dBm.
[Room for further experimentation.]

This table shows readings both ways: RSSI (dBm) <-> Signal strength (%).
The **Drop in power** column is the decrease in power from
a reference signal of 100% (-40 dBm).
For manual calculations, see the
[RSSI to Percentage](./RSSI-Percentage.xlsx)
spreadsheet in _/docs_.

| dBm | Percent |  | Percentage | dBm |  | Drop in power |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| -40 | 100% |  | 100% | -40 |  | 100.000000% |
| -45 | 92% |  | 95% | -43 |  | 50.000000% |
| -50 | 83% |  | 90% | -46 |  | 25.000000% |
| -55 | 75% |  | 85% | -49 |  | 12.500000% |
| -60 | 67% |  | 80% | -52 |  | 6.250000% |
| -65 | 58% |  | 75% | -55 |  | 3.125000% |
| -70 | 50% |  | 70% | -58 |  | 1.562500% |
| -75 | 42% |  | 65% | -61 |  | 0.781250% |
| -80 | 33% |  | 60% | -64 |  | 0.390625% |
| -85 | 25% |  | 55% | -67 |  | 0.195313% |
| -90 | 17% |  | 50% | -70 |  | 0.097656% |
| -95 | 8% |  | 45% | -73 |  | 0.048828% |
| -100 | 0% |  | 40% | -76 |  | 0.024414% |
|  |  |  | 35% | -79 |  | 0.012207% |
|  |  |  | 30% | -82 |  | 0.006104% |
|  |  |  | 25% | -85 |  | 0.003052% |
|  |  |  | 20% | -88 |  | 0.001526% |
|  |  |  | 15% | -91 |  | 0.000763% |
|  |  |  | 10% | -94 |  | 0.000381% |
|  |  |  | 5% | -97 |  | 0.000191% |
|  |  |  | 0% | -100 |  | 0.000095% |

## What's my SSID?

In Windows 10 & 11 and in Linux (tested in Ubuntu 24.04),
the APIs to retrieve signal strength also return the SSID and BSSID.

That's not the case in macOS 15 (September 2024) and newer.
In those newer macOS releases, Apple locks down those two values
for security purposes, and those values return as "\<redacted>".
It appears not to be possible to get the real values without
creating a signed binary that acquires Location Access permissions
from the user.

There is a partial workaround on macOS, though.
The `system_profiler` call provides a list of _all_ the SSIDs
"in the neighborhood" along with their signal strengths.
The current SSID _IS_ available from the
`spairport_current_network_information` property of the command's output.
(The BSSID is still not available, though.)

The `scanWifi()` function looks for the presence of the
current network from `system_profiler` and saves that value to
replace "\<redacted>" when returning measured the WifiResults.

## Localization

The Windows `netsh wlan show interfaces` code is localized for the
system's language setting.
Curiously, different English systems also use slightly different
labels (e.g. "AP BSSID" vs "BSSID").
Consequently, there is no obvious algorithm for retriving values
from the `netsh...` output.

At server startup, the _lib/localization.ts_ code reads a set of
_xxxx.json_ files to build a reverse lookup table of the localized string
that maps to the corresponding WifiNetwork property (or null).

The Windows parsing code then retrieves each label from the
`netsh ...` command, does a reverse lookup, and sets the
appropriate property.

### Creating a localization file for your system

To create a localization file for your Windows system's language:

* Duplicate one of the _data/localization_ files
* Rename it to _XX.json_, where "XX" is the proper code for the language
  (e.g., _fr.json_ for a French system). The exact name is not important
  except for the _.json_ suffix.
* Run `netsh wlan show interfaces` from the command line
* Paste the output of the `netsh wlan...` into the bottom of the window.
* Comment out those lines (use `//` at the start of the line),
  and remove the prior output
* Add a comment indicating the version of Windows (Win10, Win11)
  and the system language
* In the JSON structure at the top of the file, replace the localized
  phrases (on the right) with the corresponding phrase from the new
  `netsh wlan...` output.
* Restart the `wifi-heatmapper` server (`npm run dev`)
  to read the new localized values
* Please add the new file as an
  [Issue to the repo](https://github.com/hnykda/wifi-heatmapper/issues)
  so it can be incorporated into the program.

## WebGL Heatmap Rendering

Heatmaps are rendered using WebGL.

The rendering technique uses **Inverse Distance Weighted (IDW) interpolation**. For each pixel, nearby survey points within a defined [Radius](#radius-calculations) contribute values inversely proportional to their distance. Closer points have more influence, while farther ones contribute less. This creates a smooth, continuous surface representing signal strength or throughput across the floorplan.

## Radius Calculations

The heatmap takes a `radius` parameter that
determines "how much space" each survey point should occupy.
Reasonable values seem to be between 100 and 500,
and can be set by the slider in the Heatmaps pane.

The _lib/radiusCalculations.ts_ file implements several AI suggestions
for algorithms as experiments.
The code currently uses the `r2` function that
computes the radius using a metric something like the density of
points within the bounding box.
This seems to give pretty pleasing results when the survey points
cover the majority of the floor plan.
Use the Radius slider to adjust the heatmap.

_Note:_ The Android
[NetSpot](https://www.netspotapp.com/netspot-wifi-analyzer-for-android.html)
app incorporates a "distance" measurement for the background image.
That may give a further hint about the size of the survey points.

## Use of localStorage()

**wifi-heatmapper** saves all the information associated with a particular
floor plan image in localStorage() in an object named
`wifi-heatmapper-floorplanImageName`.
The "current" floorplan image name is saved as a string in `wifi*heatmapper`.
When the app is reloaded, the program retrieves that name, then loads the
associated settings.

The Settings pane allows the user to select from various floor plans
that are saved in the _media_ folder on the server,
and loads the saved settings when it is selected.
(Uploading a new image creates a new `wifi-heatmapper...` object.)
