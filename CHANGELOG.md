# Changelog

_This section follows the precepts of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) so that future readers can understand the state and evolution of the project._

## [Unreleased - working toward 0.3.0]

* Setting the iperf3 server to "localhost" or "127.0.0.1" only tests
  Wi-Fi signal strength and disables iperf3 tests.
  This avoids the requirement of setting up an iperf3 server simply
  to use the program to get a heat map of the Wi-Fi signal.
* If there are no iperf3 tests (TCP or UDP), their heat maps are not shown.
* The "Floor plan" setting is now a dropdown that selects from all the PNG or JPEG
  files in the _/media_ directory on the server.
  These images are used as keys to select the corresponding survey points and
  other settings that were collected for that background image.
  All the settings are saved in both the current `wifi-heatmapper` object
  of localStorage() as well as a copy in `wifi-heatmapper-floorplanImageName`
* Selecting a new floor plan image loads the corresponding survey points.
* Uploading a new floor plan image creates a new object in localStorage()
  tagged with its name, as described above.
* Significant editorial work on README and other pages in _docs_

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
