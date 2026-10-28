# Changelog

_This section follows the precepts of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) so that future readers can understand the state and evolution of the project._

## Unreleased

### Security

* The API refuses requests from other web sites. Before, any page open in
  your browser could send a request to the app on `localhost` that ran
  commands on your computer. Requests must now come from the app's own
  pages or from a non-browser tool, and be addressed to a local host name
  (see `WIFI_HEATMAPPER_ALLOWED_HOSTS` in the README).
* The sudo password no longer appears in debug logs (`LOG_LEVEL=2`) or in
  error messages: failed `echo … | sudo -S …` commands put it in the error
  text, which could be shown in the app or logged.
* **No command runs through a shell any more.** The speed test server, the
  iperf3 options and the Wi-Fi tools are passed to the program as separate
  arguments, so a value such as `x; touch /tmp/pwned` is just a (wrong)
  server name, never a second command. The sudo password goes to `sudo` on
  its standard input instead of `echo <password> | sudo -S` on a command
  line, and is checked with `sudo -k`, so a cached sudo login no longer
  makes a wrong password look right. Server code is marked `server-only`
  instead of `"use server"`, which had made every exported function of the
  measurement code callable from the network as a server action.

### Added

* **Measure with an AI agent while you carry the laptop.** The MCP server
  has `start_measurement`, `wait_for_measurement` and `cancel_measurement`
  tools and a `survey_walkthrough` prompt: the agent tells you where to go,
  waits until you confirm you're there, measures at that spot, saves the
  point and tells you the result in plain words, then moves on. Clients ask
  before each measurement, one runs at a time, and an open app tab shows
  each one live. Where reading Wi-Fi needs the sudo password, you type it
  in Settings as before; the app's server now keeps it in memory (never on
  disk, never returned, gone on restart) so measurements the agent starts
  can use it. `update_settings` and `copy_settings` now accept the same
  speed settings as the app, and a speed test server must be a valid host
  name, IP address or `host:port`. See [the MCP guide](docs/guide/mcp.md).
* **Set up a second floor plan in fewer steps.** A new survey starts with
  the speed settings (what to measure, speed test server, test duration,
  iperf3 commands) of the survey saved last, instead of the defaults, and
  Settings says where they came from. **Copy settings from…** in Settings
  copies speed settings, access point names or the heat map look from
  another survey (`POST /api/settings/copy`), and the MCP server has a
  matching `copy_settings` tool. Points and floor plans are never copied.
* **Report a problem from the app.** A small help button in the bottom-right
  corner (hidden while the measurement panel is open there) opens **Report a problem**, **Docs** (the guide for the current tab)
  and **What's new**. The report shows exactly what would be shared (app
  version, OS, how the app runs and reads Wi-Fi, iperf3, signal only or
  signal and speed, the last measurement and the recent log, kept in memory
  only) and opens
  a prefilled GitHub issue in the browser, or copies it. The sudo password
  is always removed; network names, MAC and IP addresses are replaced by
  placeholders unless you include them. **Could not measure**, **Saved
  without speed** and error messages have a **Report this** link. The bug report is now a GitHub issue
  form, the MCP server has a `report_problem` tool, and `GET /api/diagnostics`
  returns the report.

* **An optional MCP server for AI agents** (Claude Code, Claude Desktop and
  other MCP clients). It reads surveys from the running app, summarises
  them, returns a numeric heat map grid computed like the app's maps, checks
  the setup, and can change a short list of settings (iperf3 server and
  commands, test duration, access point names, radius, opacity, colour
  scales). Prompts for analysing, comparing and planning surveys are
  included. It only talks to the app on this computer, never sees the sudo
  password, and can't take measurements yet. `npm run mcp:build`; the
  desktop app ships it as `server/mcp-server.mjs`. See
  [the MCP guide](docs/guide/mcp.md).

* Access point names can match several BSSIDs at once: end the MAC address
  with `*`, for example `aa:bb:cc:dd:ee:*`, to name every BSSID that starts
  with it. An exact MAC address still wins, then the longest prefix (#99).
* **Noise and signal-to-noise ratio** (#59). Each measurement stores the
  noise floor (dBm, averaged like the RSSI) where the platform reports it:
  macOS (Wi-Fi helper, `wdutil`) and Linux drivers that print noise in
  `iw dev <interface> survey dump` (many do; Intel iwlwifi often doesn't).
  Windows has no noise reading. A new "Signal-to-noise ratio" heat map
  (0–50 dB by default, with fixed-scale support) uses the points that have
  noise, and the point details, points table and CSV export show noise and
  SNR.

### Changed

* **Signal only or signal and speed is now an explicit choice** (#109).
  Settings has a "What to measure" option per survey, instead of "leave
  the iperf3 server at localhost". Existing surveys keep what they did:
  `localhost` or an empty server becomes signal only, any other server
  signal and speed. New surveys start with signal only. The speed server,
  test duration and iperf3 commands (now under "Advanced") only show for
  speed, with a setup checklist and a "Test connection" button. The header
  strip, the measurement panel, the heat maps and the points table all say
  which mode the survey is in, and speed maps and columns stay hidden until
  a point has speed data. The UI says "speed", "download / upload" and
  "fixed rate (UDP)" instead of throughput and TCP/UDP.

* **The server takes the measurement and saves the point.** Closing or
  reloading the page mid-measurement no longer loses it, and every open
  page of the survey shows the progress. Cancel stops at once, even in the
  middle of a speed test (it stops iperf3), and a cancelled measurement is
  never saved. One measurement runs at a time; starting another meanwhile
  says so. `POST /api/start-task?action=start` now takes the survey and
  the spot and returns a job id; see docs/dev/architecture.md.
* The sudo password is checked once per password, not before every
  measurement.
* **iperf3 commands are now extra iperf3 options.** Settings > Advanced:
  iperf3 options takes the extra options per test (for example `-P 4`, or
  `-b 500M` for UDP); the app builds the rest of the command (server, port,
  duration, `-R`, `-u`, `-J`) and shows it under each field. Surveys keep
  their extra options: an older command template is read into its
  options, and one with shell syntax (pipes, `;`, redirects, quotes) or
  another program falls back to the defaults with a warning in the log.
  The settings API and the MCP `update_settings` tool take
  `iperfCommands` as argument lists, such as `{ "udpUpload": ["-b",
  "500M"] }`.

* **Windows reads Wi-Fi details from the Native Wifi API** (`wlanapi.dll`,
  through koffi) instead of parsing `netsh` output, so it works in any
  display language and stores the real RSSI in dBm. 6 GHz networks are
  labelled 6 GHz, nearby networks show their security, and the connected
  adapter is used when there are several. `netsh` remains as a fallback.
  Based on work by @WayneUON (#85, #79).
* The stored RSSI of a measurement is now the average of the dBm readings
  taken during it (on every platform), not a conversion of the average
  signal percentage.

### Fixed

* A missing iperf3, a missing or unreachable speed test server, or a failed
  iperf3 run no longer stops a measurement or loses it. The signal reading
  is saved and the panel says "Saved without speed" with the reason, the
  same on macOS, Windows and Linux. Before, macOS and Linux refused to
  measure without iperf3, Windows lost the reading, and an empty server
  blocked every measurement (#109).
* A speed test server given as `host:port` is checked on that port (it
  was silently skipped), and IPv6 addresses work: `[fe80::1]:5201` or a
  bare address (#109).
* Cancelling a measurement and clicking another spot could save the first
  spot's numbers at the second spot, and a second tab took the progress
  away from the first. Each measurement is now its own job on the server.
* The measurement panel's title says "Could not measure" on errors
  instead of staying at "Starting".
* The settings API never returns a sudo password, even from an old or
  hand-edited survey file.
* Windows: each Wi-Fi reading no longer waits about 5 seconds before it is
  read on English, German, French, Spanish and Italian systems. The app was
  waiting for a "State" line that only the Chinese table recognised.
* The iperf3 server check no longer needs `nc` (Linux and macOS) or
  PowerShell (Windows), so a missing `nc` no longer shows up as "Cannot
  connect to iperf3 server" (#82).
* Linux no longer requires NetworkManager: `nmcli` is optional and only
  lists nearby networks, so systems using iwd or systemd-networkd can
  measure (#82).

## Version 0.7.0 - 2026-10-27

### Added

* **Fixed heat map scales**: set lower and upper bounds per map, saved with
  the survey, to compare signal, throughput, jitter and packet maps across
  surveys. Downloaded maps use the same bounds. Thanks @richardbarlow (#97).

### Fixed

* Signal heat maps now always colour 0–100%, matching the legend, instead
  of stretching to the strongest point measured. Surveys with a weak best
  point look less green than before.
* Linux measurements now select a connected managed Wi-Fi interface instead
  of the first interface, ignoring monitor, AP and P2P devices. Disconnected
  or incomplete link readings report an error instead of saving empty AP
  details and a false zero-strength reading. Thanks @richardbarlow (#98).

## Version 0.6.0 - 2026-10-04

### Added

* **Desktop apps** for macOS (Apple silicon and Intel), Windows and Linux
  (x64 and ARM64), built by GitHub Actions for every release. No Node.js or
  terminal needed; data lives in the system's app-data folder. Early builds:
  see [docs/guide/install.md](docs/guide/install.md) for install steps and what has been
  tested. Mac users can also `brew install --cask hnykda/tap/wifi-heatmapper`.
* **macOS without sudo**: a small helper reads the Wi-Fi signal through
  CoreWLAN, and with Location access also the network name that `wdutil` now
  hides. Works from source too (`npm run build:macos-helper`).
* **Linux**: the current link is read with `iw` without sudo when the system
  allows it; the sudo password is only needed as a fallback.

### Fixed

* The About dialog showed the wrong macOS version on macOS 27 ("28"); it now
  asks `sw_vers`.
* Settings shows where a survey is really saved (the app-data folder in the
  desktop app), and no longer tells desktop users to run `npm` commands.

## Version 0.5.0 - 2026-09-11

A visual and structural overhaul. Surveys made with 0.4.x keep working;
floor plans uploaded to `public/media` are copied to `data/media` on first start.

### Added

* **Mock mode** (`npm run dev:mock`, or `WIFI_HEATMAPPER_MOCK=1`): synthetic
  Wi-Fi and iperf3 results so the app runs on any machine without sudo,
  iperf3 or a Wi-Fi card. A "Mock data" badge shows in the header, and the
  Floor plan tab gets an "Add sample points" button.
* **End-to-end tests** with Playwright (`npm run e2e`) that run the real app
  in mock mode. CI runs them on every pull request.
* **Welcome message** for first-time users at the top of the page; dismiss
  it with "Got it" and it stays dismissed (About can bring it back).
* **Dark theme**, following the OS setting with a toggle in the header.
* **About dialog** with version, OS, Node and iperf3 details for bug reports,
  and `GET /api/status` behind it.
* **Access point names** editor in Settings (the component existed but was
  never shown). Named access points appear in point details and the table.
* **Delete a floor plan** (and its survey) from Settings.
* **Export survey points as CSV** from the Survey points tab.
* **Heat map captions**: downloaded maps carry the metric, floor plan name,
  point count and date.
* Survey files now record `meta` (app version, OS, save time). Fixes #73.
* `WIFI_HEATMAPPER_DATA_DIR` moves the whole data directory.
* `CONTRIBUTING.md`, a pull request template, and `CLAUDE.md`.

### Changed

* **New interface.** Compact header with the four sections as tabs (the
  active tab is kept in the URL), a summary strip showing the current floor
  plan, point count and iperf3 server, a proper settings form with
  explanations, a measurement progress panel instead of a toast, cleaner
  point details, a controls column on the Heat maps tab, and a leaner table.
  Survey dots stay readable on small screens and touch screens.
* Floor plan images live in `data/media/` and are served by
  `/api/media/<name>`. This makes `npm run build && npm start` work and lets
  the Dockerfile build a real production image (multi-stage, Next standalone
  output, about 270 MB).
  Docker now needs a single volume: `-v ./datas:/app/data`.
* Settings are saved a short moment after the last change instead of on
  every keystroke.
* Server start-up moved to `src/instrumentation.ts` (Next.js' official hook)
  so it also runs under `next start`.
* Measurement errors are shown with their real cause (for example a wrong sudo
  password or a changed access point) instead of "wifi or iperf data is null".
* The heat map legend for throughput runs from 0 to the best measured value,
  which is how the colours are actually computed.
* Removed the unused "Blur" setting and the debug "Add test points" button
  from the production UI.
* Bundled floor plans moved from `public/` to `assets/floorplans/`.
* CI runs on Node 22 with `npm ci`.

### Fixed

* Custom iperf3 commands (for example a higher UDP `-b` rate) were never sent
  to the server, so edits had no effect. Fixes #81.
* Windows: a typo split `netsh` output on `"]n"` instead of newlines, and
  `getWifi()` could wait forever when no localized "State" line matched.
  Now it gives up after 5 seconds with a clear localization error. Fixes #83.
* Windows: `netsh` output that matches no labels at all reports the
  localization problem; partial matches keep working (issue #75).
* Heat map scales showed "0 to 0" when no throughput had been measured;
  such maps now show an explanation instead. Fixes #30.
* Editing a gradient stop's position corrupted the gradient (`parseInt` on
  "0.45").
* Two survey points could get the same id when measurements were quick.
* The settings provider was mounted twice (layout and page).

---

## Version 0.4.0 - 2026-01-07

### Changed

* **Breaking:** Survey data is now stored as JSON files in `data/surveys/`
  instead of browser localStorage. This provides:
  - Persistent storage that survives browser cache clears
  - Easy backup and version control of survey data
  - Portability between machines and browsers
  - No size limits

* Existing localStorage data is automatically migrated on first load.
  Users will see a toast notification confirming the migration.

* New API endpoint `/api/settings` handles reading/writing survey files.

* Floorplan dropdown is now scrollable when there are many images,
  preventing the list from overflowing the screen.

* Improved error logging for file storage operations.

---

## Version 0.3.6 - 2026-01-04

* Enable debug logging for command execution in `execAsync()`.
  Run with `LOG_LEVEL=2` to see commands and their output.
  Helps diagnose issues like #65.

---

## Version 0.3.5 - 2025-10-01

* Updated screen shot on README.md to use a heat map drawn on
  an image of home and garage.
  The image was generated by ChatGPT in the style of Google Maps.
  Fixes #42 & #48
* Include that Home & Garage.jpg image as one of the default images.
* Re-ordered items in `PopupDetails` to show most important fields first
* Scale the visual dimensions of each survey point in the Floorplan
  to make them "large enough"
  relative to the width of the background image/floorplan.
  This makes them more visually prominent.
  Survey points don't look like "tiny dots"),
  and are easier to touch on a touchscreen.
* Floorplan now checks to see if a click is less than 20 units
  (not 10 units) from an existing survey point to determine if
  that was the point that was clicked.
  This solves a "fat finger" problem on touchscreens.
* Each click for a survey point now draws an empty circle
  to indicate the location of the click.
  The circle gets filled in when the measurement completes,
  or removed if there is an error or the measurement is cancelled.
* Dockerfile now works with new WifiActions.
  Required installation of `networkmanager` and `networkmanager-cli`
  along with some fiddling with `docker run ...` command
* Eliminated the sudo password requirement on Docker:
  even though the container runs Alpine Linux,
  the process runs as root in a Docker container.
  Fixes #56
* Changed all public-facing names to use the term "Wi-Fi" - the (mostly)
  accepted "official" name.
* Factor wifi into separate `WifiActions`.
  _wifiScanner.ts_ is now a factory
  that returns an OS-specific object with functions for preflightSettings(),
  checkIperfServer(), scanWifiSettings(), setWifi(), and getWifi()
  These functions are defined in the _wifiScanner-xxxx.ts_ files
* The `setWifi()` function now throws an error for all platforms.
  This function is no longer implemented (it was a hold-over) from
  the `scan-wifi` branch that had too many constraints.
  See [Theory of Operations](./docs/guide/how-it-works.md#network-names-on-macos) for more info.
* ~~Updated _wifiScanner-macos.ts_ to use `system_profiler` to retrieve
  the name of the current SSID.~~
  macOS 26 (September 2025) now hides both SSID and BSSID
  (returning "\<redacted>") from the `system_profiler` call.
  _wifiScanner-macos.ts_ no longer uses that function
  because it delays every measurement without returning useful information.
* New Linux test cases for parsing `nmcli ...` to accompany the updated
  _wifiScanner-linux.ts_ that implements `WifiActions`.
* frequencyToChannel() function converts Wi-Fi frequency
  into the proper numeric channel.

---

## Version 0.3.4 - 2025-08-31

* Revamp localization code (swapping the mapping object to use "localized-string":"internal-name")
* Refactor certain utility routines: move them into _utils.ts_
* Incorporate HeatmapModal fix for #49
* Added code to macos & windows wifi_scanner to be able to test parsing
* Significant number of new test data files, along with many
  new test _xxx.test.tsx_ files.
* Print macOS name and version at startup (e.g., Sequoia 15.5) instead of
  "darwin" and some obscure build number. They are available in the
  OS details printed on the next line.

## Version 0.3.3 - 2025-08-27

* Add "Command to test" in Advanced settings to run a
  command-line and display the results in the Console
* Fixed bug in displaying heatmap when "use dBm instead of %" is selected
* Fixed bug in drawing ticks in the scale bar when showing dBm readings
  Fixes #30
* Fixed bug where RSSI of 0 (no signal) was reported as
  100% not 0% signal strength. Fixes #32
* Fixed bug in Firefox that caused the dropdown for the background image to freeze
* Merge many fixes from the (temporarily abandoned) "scan-wifi" branch
* Tune up appearance of the NewToast progress window
* Rename many definitions in `types.ts` to match their actual function

## Version 0.3.2 - 2025-07-25

* Migrated from `heatmap.js` to a custom WebGL-based renderer
  using inverse-distance weighting (IDW)
* (This was never formally given the 0.3.2 version number)

## Version 0.3.1 - 2025-06-08

* Add French, Spanish, and German localizations
* Throw a helpful error message if no Wi-Fi labels are recognized on Windows.
  Refer the user to [Help us with Windows localizations](https://github.com/hnykda/wifi-heatmapper/issues/26)
* Improve test routines for localization
* Display Node.js version in the server log information
* Update To-Do.md
* Rename several `server-xxx.ts` files

## Version 0.3.0 - 2025-06-01

* The "Floor plan" setting is now a dropdown that selects from
  all the PNG or JPEG files on the server.
  These images are used as keys to select the corresponding survey points and
  other settings that were collected for that background image.
  Selecting a new floor plan image loads the corresponding survey points.
* **Upload an image...** allows uploading a new image.
* Setting the iperf3 server to "localhost" disables iperf3 tests
  and only tests Wi-Fi signal strength.
  This makes it possible to get a WiFi heat map without requiring
  an iperf3 client and server.
* If there are no iperf3 tests (TCP or UDP), their heat maps are not shown.
* All Settings items have an "information" button.
* Significant editorial work on README and other pages in _docs_
* Changed the Popup details window to use the term "Band"
  instead of "Frequency".
  Fixed the units to use "GHz" (was "MHz")
* Now parses the `wdutil` command on macOS 12 ("Catalina")
* Obfuscated the SSID, BSSID, and Profile for wifi test files
* Passes all tests: `npm run typecheck`, `npm run lint`, `npm test`
* Tested on Win 11; Win 10; Ubuntu 24.04; macOS 12.7.2; macOS 15.5

## Version 0.2.1 - 2025-04-04

* Change the **Radius Divider** to a slider in the `Heatmap` pane.
* Move the other Advanced Configuration from the `Heatmap` component into the `SettingsEditor`
* Make all the other settings all part of the global settings object
* Upgrade all npm packages to current versions (use `ncu`)
* EXCEPT Tailwind, which remains at 3.4.1 (because the v3 -> v4 migration is difficult)

## Version 0.2.0 - 2025-03-29

* Refactor the code base
  to lift most state from the _page.tsx_ into a `GlobalSettings`
  component that wraps the remaining components.
* Removed Autosave setting (code now always saves to `localStorage()`)
* Separate the GUI into four tabs: Configuration; Floor Plan; Heat Maps; Survey Points.
  Each tab retains substantially the same function as earlier versions.
* Update the heat maps to show "Green is good; red is bad"
* Heat map scale is a gradient from green at 100%
  to turquoise at 60%,
  then to blue at 40%,
  then yellow at 35%,
  then to red at 0%.
  This tends to show good enough signal levels as green,
  with decreasing quality from turquoise to blue.
  Blue and above are "good enough".
  Yellow and red (35% and below) indicate poor signal strength.
* Update survey points to show the color of the signal strength
  at that point along with the strength (as percent)
* Heatmaps use a heuristic for the "heat spot" sizes;
  use global "spot size" to adjust as needed.
  (Wants to be a slider...)
* Toast-based window now shows progress
  during the entire Wi-Fi and speed test survey process
  and allows canceling the measurement
* Store all the `GlobalSettings` in `localStorage()`.
  This needs to be generalized to save different maps
  and their readings in separate files.
* Factored _actions.ts_;
  moved many of those functions to the proper source file
* Changed point IDs to be named sequentially, e.g., Point\_1, Point\_2, etc.
* Localize the Windows `wifiScanner.ts` for various language settings
* Pass the sudo password to the Linux wifi code
* Factor out the macOS, Windows, and Linux scanning code into separate
  files for easier maintenance
* [Theory of Operation.md](./docs/Theory of Operation.md) has many
  notes that discuss how this code works
* [To-Do.md](./docs/dev/to-do.md) shows outstanding questions and errors.

## Version 0.1.0 - 2025-01-25

* Earlier versions
