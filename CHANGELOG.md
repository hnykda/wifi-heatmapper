# Changelog

_This section follows the precepts of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) so that future readers can understand the state and evolution of the project._

## Version 0.2.0 - 2025-03-??

* Refactor the code base
  to lift most state from the _page.tsx_ into a `GlobalSettings`
  component that wraps the remaining components.
* Removed Autosave setting (code now always saves)
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
* Minimized the functions in _actions.ts_;
  moved many of those functions to the proper source file
* Changed point IDs to be named sequentially, e.g., Point_1, Point_2, etc.
* Localize the Windows `wifiScanner.ts` for various language settings
* Pass the sudo password to the Linux wifi code
* Factor out the macOS, Windows, and Linux scanning code into separate 
  files for easier maintenance

## Version 0.1.0 - 2025-01-25

* Earlier versions
