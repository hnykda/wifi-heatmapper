# Theory of operation

**wifi-heatmapper** is a Next.js app that uses to a local backend server
to measure both Wi-Fi signal strength and
(optionally) TCP and UDP speeds to an `iperf3` server.
Because the tests can be made
at various locations within a site
**wifi-heatmapper** can produce a heat map that shows
where signal/throughput are high and low.

## Development: Testing before a release

There are a number of tests to run before making
a new **wifi-heatmapper** release.
The entire code base should pass all tests with no warnings or errors.
These include:

* `npm run typecheck` - run the Typescript compiler on all files
* `npm run lint` - run the linter on all files
* `npm test` - run all the test cases

## How wifi-heatmapper works

To get information about the Wi-Fi signal and other parameters,
the server backend invokes the commands below and parses the output.
The web GUI then just stores everything in simple JSON
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
| All | `iperf3` | See **iperf3** note below |

**iperf3** must be installed locally to make TCP or UDP measurements.
(If it is not installed, those measurements will be skipped.) 
A version greater than 3.17 is recommended for both server and client
(ideally the same version, but that's not strictly necessary). 
The `iperf3` binary also must be available in `PATH`.
For Windows you might have to set the path
`set PATH=%PATH%;C:\path\to\iperf3`,
e.g. use `set PATH=%PATH%;C:\iperf3` (or `setx` to make it permanent)
before running `npm run dev`.

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
  That constraint is unworkable: that effort has been abanonded for now._  
* `getWifi()` Return the array with a single `WifiResults` with all the
  information for the current SSID.  

## Running with higher LOG_LEVEL

You can use `LOG_LEVEL=level npm run dev` to control logging,
where the `level` is
0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal.
Use this when submitting the bug reports.

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

* The _api/media/route.ts_ file listens for a GET _api/media_ request
  and returns the list of files in the _public/media_ directory.
  The floorplan image itself returns from GET _/media/filename.png_
  (or _.jpg_).
  A POST _api/media/filename.png_ uploads a file to that directory.
  
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

* A click on the Floorplan also opens the `NewToast` component.
  (This happens because the click sets `toastIsOpen` to true.
  NewToast is "conditionally rendered" (`{toastIsOpen && <NewToast... />}`
  in the JSX).
  NewToast issues GET _/api/events_ that starts a stream of
  Server Sent Events with `sendToClient()` 
  that is registered in the global _sseGlobal.ts_ module.
  Those events contain information used to update the information
  shown in NewToast.
  
* NewToast also has a **Cancel** button that aborts the measurement
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

## RSSI and Signal Strength

The percentage signal strength (0-100%) is an intuitive measure
of the Wi-Fi signal.
Some OS utilities provide this value as a percentage, others provide "dBm".
The `rssiToPercentage()` and `percentageToRSSI()` functions
in _lib/utils.ts_ convert from one to the other.
At the conclusion of each measurement, the code saves both values.

wifi-heatmapper treats an RSSI of -40 dBm as 100% signal strength.
This value is typically seen a couple feet from the access point.
A 0% signal represents an RSSI of -100 dBm.
(See the table below for conversion between % and dBm.)
In practice:

* Signal level values down to around 75% provide excellent service.
  wifi-heatmapper colors any point in this range as green ("good").
* Values between 75% and 50% provide acceptable service, with a
  gradient from turquoise to blue (at 50%)
* Any signal strength below 40% is too low for reliable service.
  The color displayed in the heatmap
  is correspondingly discouraging (yellow, red).

This table shows readings both ways: RSSI (in dBm) <-> Signal strength (%).
The **Drop in power** column is the decrease in power from
a reference signal of one milliwat (100% or -40 dBm).
For more fine-grained calculations, see the
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

## What are the SSID and BSSID on macOS?

In Windows 10 & 11 and in Linux (tested in Ubuntu 24.04),
the APIs that retrieve signal strength also return the SSID and BSSID.

That's not the case in macOS 15 (September 2024) and newer.
In those newer macOS releases, Apple locks down those two values
for security purposes, and the APIs return `<redacted>`.
It appears the only way to get the BSSID value is to
create a signed binary that acquires Location Access permissions
from the user.
This task is mentioned in the To-Do.md as a long-term project.

There is a workaround for the SSID on macOS.
The `system_profiler` call provides a list of _all_ the SSIDs
"in the neighborhood" along with their signal strengths.
The current SSID _IS_ available from the
`spairport_current_network_information` property of the command's output.
(The BSSID is still not available, though.)

The `scanWifi()` function looks for the presence of the
current SSID name from `system_profiler` and uses that name to
replace `<redacted>` when returning measured the WifiResults.

## Localization

The Windows `netsh wlan ...` code is localized for the
system's language setting.
Curiously, different English systems also use slightly different
labels (e.g. "AP BSSID" vs "BSSID").
Consequently, there is no obvious algorithm for retriving values
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
  * `netsh wlan show profile name="profile"` where `profile` is one of the profiles listed in the previous command
* Paste the output of the all four commands into the bottom of the new file.
* Comment out the new lines (use `//` at the start of the line),
  and remove the prior output
* Add a comment (use "//") indicating the version of Windows (Win10, Win11)
  and the system language
* In the JSON structure at the top of the file, replace the localized
  phrases from the `netsh wlan...` output (on the left) with the corresponding phrase on the right.
* Restart the `wifi-heatmapper` server (`npm run dev`)
  to read the new localized values
* If you have a new file, or if you have questions, create an
  [issue in the repo](https://github.com/hnykda/wifi-heatmapper/issues).

## WebGL Heatmap Rendering

Heatmaps are rendered using WebGL.

The rendering technique uses **Inverse Distance Weighted (IDW) interpolation**. For each pixel, nearby survey points within a defined [Radius](#radius-calculations) contribute values inversely proportional to their distance. Closer points have more influence, while farther ones contribute less. This creates a smooth, continuous surface representing signal strength or throughput across the floorplan.

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

## Use of localStorage()

**wifi-heatmapper** saves all the information associated with a particular
floor plan image in localStorage() in an object named
`wifi-heatmapper-floorplanImageName`.
The name of the current floorplan is also saved
in localStorage() in `wifi*heatmapper`.
When the app is reloaded, the program retrieves that name, then loads the
associated settings.

The Settings pane allows the user to select from various floor plans
that are saved in the _media_ folder on the server,
and loads the saved settings when it is selected.
(Uploading a new image creates a new `wifi-heatmapper...` object
and sets the `wifi*heatmapper` string to that file name.)
