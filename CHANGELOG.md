# Changelog

_This section follows the precepts of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) so that future readers can understand the state and evolution of the project._

## [Unreleased]

* Updated screen shot on README.md to impose a heat map on a (fake) 
  Google Maps image of home and garage.
* Factored wifi into separate `WifiActions`.
  _wifiScanner.ts_ is now a factory
  that returns an OS-specific object with functions for preflightSettings(),
  checkIperfServer(), scanWifiSettings(), setWifi(), and getWifi()
  These functions are defined in the _wifiScanner-xxxx.ts_ files
* Updated _wifiScanner-macos.ts_ to use `system_profiler` to retrieve
  name of the current SSID. Still cannot get its BSSID.
* Removed (cause to throw an error) `setWifi()` since the entire
  `scan-wifi` branch was too hard to implement.
  See Theory of Operations for details.
* Updated _wifiScanner-linux.ts_ to implement `WifiActions`.
  Includes new tests for parsing `nmcli ...`
* Re-ordered `PopupDetails` to list most important fields first
* Changed all public-facing names to use "Wi-Fi" - the (mostly)
  accepted "official" name.
* Will probably become version 0.3.5

---

## Version 0.3.4 - 2025-08-31

* Revamp localization code (swapping the maping object to use "localized-string":"internal-name")
* Refactor certain utility routines: move them into _utils.ts_
* Incorporate HeatmapModal fix for #49
* Added code to macos & windows wifi_scanner to be able to test parsing
* Significant number of new test data files, along with many
  new test _xxx.test.tsx_ files.
* Print macOS name and version at startup (e.g., Sequoia 15.5) instead of
  "darwin" and some obscure build number. They are available in the
  OS details printed on the next line.

## Version 0.3.3 - 2025-08-27

* Add "Command to test" in Advanced settings to run a command-line and display the results in the Console
* Fixed bug in displaying heatmap when "use dBm instead of %" is selected
* Fixed bug in drawing ticks in the scale bar when showing dBm readings
* Fixed bug where RSSI of 0 (no signal) was reported as 100% not 0% signal strength.
* Fixed bug in Firefox that caused the dropdown for the background image to freeze
* Merge many fixes from the (temporarily abandoned) "scan-wifi" branch
* Tune up appearance of the NewToast progress window
* Rename many definitions in `types.ts` to match their actual function

## Version 0.3.2 - 2025-07-25

* Migrated from `heatmap.js` to a custom WebGL-based renderer using inverse-distance weighting (IDW)
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
* Changed the Popup details window to use the term "Band" instead of "Frequency". Fixed the units to use "GHz" (was "MHz")
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
* Heatmaps use a heuristic for the "heat spot" sizes; use global "spot size" to adjust as needed. (Wants to be a slider...)
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
* [To-Do.md](./docs/To-Do.md) shows outstanding questions and errors.

## Version 0.1.0 - 2025-01-25

* Earlier versions
