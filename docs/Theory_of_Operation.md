# Theory of operation

**wifi-heatmapper** is a Next.js app that uses to a local backend server
to measure both Wi-Fi signal strength and
(optionally) TCP and UDP speeds to an `iperf3` server
at various locations.
It produces a heat map for each set of
measurement points ("surveyPoints")
that show where signal/throughput are high and low.

## Tests

There are a number of tests to run before making a new release.
**wifi-heatmapper** should pass all tests.
These include:

* `npm run typecheck` - run the Typescript compiler on all files
* `npm run lint` - run the linter on all files
* `npm test` - run all the test cases

## Platform-Specific Commands

**wifi-heatmapper** parses the outputs of the following CLI commands
to get the measurements of the Wi-Fi strength and throughput.

| Platform | Commands          | Notes                                                                                                                                                    |
| -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | `wdutil`, `ioreg` | Both are usually part of the system, sudo password is needed for `wdutil`                                             |
| Windows  | `netsh`           | Part of the system  |                                                                                       
| Linux    | `iw`              | `iw` might need to be installed via your distro package manager, you will need to provide your wireless device id (e.g. "wlp4s0", we do try to infer it) |

**wifi-heatmapper** requires that `iperf3` be installed locally to make TCP
or UDP measurements. 

In all cases, `iperf3` must be available in `PATH`. For Windows you might have to do something like `set PATH=%PATH%;C:\path\to\iperf3`, e.g. do `set PATH=%PATH%;C:\iperf3` (or `setx` to make it permanent) before running `npm run dev`. The version of at least 3.17 is weakly recommended for `iperf3` on both server and client (ideally the same version, but that's not strictly necessary). 

## How wifi-heatmapper works

To get the information, **wifi-heatmapper** invokes
`iperf3`, `wdutil` and `ioreg` commands
(or equivalent on different platforms)
via JS `child_process` and parses the output.
The webapp then just stores everything in simple JSON
"database" file in localStorage().

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

This table shows readings both ways: RSSI (dBm) <-> Percentage

| Pct | dBm |   | dBm | Pct | dBm | Pct |
|-----|-----|---|-----|-----|-----|-----|
| 0% | -100dBm |  | -100dBm | 0% |  -100dBm | 0% |
| 10% | -94dBm |  |  -94dBm | 10% |  -90dBm | 17% |
| 20% | -88dBm |  |  -88dBm | 20% |  -80dBm | 33% |
| 25% | -85dBm |  |  -85dBm | 25% |  -75dBm | 42% |
| 30% | -82dBm |  |  -82dBm | 30% |  -70dBm | 50% |
| 40% | -76dBm |  |  -76dBm | 40% |  -65dBm | 58% |
| 50% | -70dBm |  |  -70dBm | 50% |  -60dBm | 67% |
| 60% | -64dBm |  |  -64dBm | 60% |  -55dBm | 75% |
| 70% | -58dBm |  |  -58dBm | 70% |  -50dBm | 83% |
| 75% | -55dBm |  |  -55dBm | 75% |  -45dBm | 92% |
| 80% | -52dBm |  |  -52dBm | 80% |  -40dBm | 100% |
| 90% | -46dBm |  |  -46dBm | 90% |   |
| 100% | -40dBm |  |  -40dBm | 100% | |

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
* Please add the new file as an Issue to the repo
  (https://github.com/hnykda/wifi-heatmapper/issues)
  so it can be incorporated into the program. 

## Radius Calculations

The `h337.create()` function takes a `radius` parameter that
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
