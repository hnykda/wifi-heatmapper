# To-Do

Random observations and questions that arise at the start of the project

## Feature and Behavior Improvements

Ideas for making the program better - in no particular order:

* Export `wifi-heatmapper-imagename` and the image itself to a saved file so it can be loaded later
* A click on the `Floorplan` pane should immediately display an
  empty dot (no color) to indicate that's where the click was.
  (Improves behavior on a touch-screen - you can see where you clicked.)
* Scale the size of the surveyPoint dot to the image, to prevent
  dots from appearing as tiny dots on a large image.
* (Maybe) During the FloorPlan measurement process, display the wifi signal
  strength heatmap underneath or as a separate floating window.
  This helps the user determine if they need
  more measurements (finer granularity) for the map.
* Bundle this into an installable (electron?) app so it can be easily installed on a tablet. Might also allow the app to get Localization permissions on macOS 15 and above so it could show the SSID/AP Name, etc.
* "Blink"" WiFi off and then back on before measurement to improve the values.
  This might give the Wi-Fi driver a chance to select a better Wi-Fi SSID
  Use case: you have used SSID-A and SSID-B in the past. You start the test near SSID-A, but subsequent survey points get farther and farther away - and closer to
  SSID-B. Since your device tends to select the strongest signal, "blinking" the Wi-FI
  might choose SSID-B automatically.
  (The current behavior is that the measured signal level gets lower and lower until
  manually switching to SSID-B.)
* This behavior would probably require some kind of "Use this SSID" / "Use best SSID"
  option, since blinking the Wi-Fi frequently adds 10-12 seconds to each measurement.

## Bugs

* Normalize data rate scale for throughput (use range of 200..700mbps with 100's dividers instead of 245..673mbps)
* Clicking a heat map (signal strength or data rate) and clicking Back should not give http error
* If `Floorplan` cannot open the image, it should display
  a sensible message like "Can't open map_name..."
* An expanded (clicked) heat map should always fit fully within the browser window (or scroll)
* The "distance" of 10 in detecting a click is not big enough when
  using some kind of tablet. An errant finger makes it look like a request
  to make a new measurement, not examine that point's statistics.
* Setting browser view to 110% should not disarrange click points
  for survey data
* Improve "fetch error" message when the web GUI has lost contact
  with the server (perhaps because `npm run dev` has been stopped)
* Fix display of BSSID; Windows parsing test code not updated;
  macOS shows `<R-ED-AC-TED>` or some such nonsense (should be "Not available")
* Fix display of dBm in the heatmap scale when not showing as %. Currently, it shows 100dBm (positive number) as green, with 0 dBm as red. The scale should use the limits of the rssiToPercentage() function.
* If browser window is at 30%, the TabPanel looks too small, yet the FloorPlan is OK.
  Do we need to give an indication of this?

## Questions

* What's the best gradient for signal strength? Linear between -40 and -80 dBM?
  Emphasize differences between good (-40 to -60?) Emphasize the bad?
  Good rule might be "green or above (yellow, orange, red) is good...
* I think the magic of this heat map system is that if drawing
  is not actually to scale it'll still give good "relative strength" info
  relative to other places on the drawing
* How to explain the difference between signal strength and throughput rates?
* Would it improve the heatmap if small dots were placed at the locations of SurveyPoints?
* What _does_ **Access Point Mappings** do? (On macOS, not much, since that info is not available in macOS 15 and above.)
* The current code runs `runIperfTest()` three times if there was an error. What problem does that solve? What caused that enhancement?
* Is it important to call `hasValidData()` in wifiScanner.ts? What information does that provide - that we can do anything about?

## DONE

* ~~Only use (percentage) signal strength to create colors (heat map & coloring survey dots)~~
* ~~Update labels on survey dots to show more interesting info (not "00000000")~~
* ~~Remove pulsing aura's when not actively sampling (or always?)~~
* ~~Is there a difference between using the currently subscribed SSID and using the sum of all SSIDs?~~ Yes. `wifi-heatmapper` only uses the current SSID, and doesn't see other SSIDs.
* ~~It's odd that "Floorplan Image" can be empty and show a floor plan...~~
* ~~Does a mDNS name work for the iperf3 server address?~~ Yes
* ~~Uncontrolled input: https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable~~ Done (I think) by setting sudoerPassword after reading other settings from a file
* ~~Alternative: Different color scale: Can heat map colors go (good to bad) _Green - Turquoise - Blue - Grey - Yellow - Red_ to comport with "normal meanings" of "Green is good, red is bad"? (Advice would then be blue or above is OK...) Grey could then be a narrow band (numeric range) between blue and yellow that is the divider between good and not-so-good~~ Done.
* ~~Update the Toast progress indicators to stay on-screen during entire survey process. Display:~~
  * ~~Starting measurement... X seconds remaining (and count down)~~
  * ~~Signal level is XX dBM / %~~
  * ~~Starting download / Download is XX~~
  * ~~Starting upload test / Upload is XX~~
  * ~~Survey is complete... Leave on screen for 5 seconds or so~~
* ~~Need better error message when initially starting survey (empty password) on macOS~~
* ~~Coalesce all the settings into a single object that can then be saved to a file. (Remember to isolate the sudoer password - never save it).~~
* ~~`wifiScanner` must throw quickly if sudoerPassword is _empty_~~
* ~~Keep Platform on the server. Don't dislay in the Settings Pane. Obviously `wifiScanner.ts` must determine the platform, but none of the other code needs to know it. We can decide on-the-fly when `platform` is needed~~
* Change Password field to conceal the characters
* Come up with a better mechanism (than random strings) for naming survey points
* Clicking in Password field (and other fields) should select the field for editing; pressing Return should accept the new value
* Canceling a measurement now stops flow of server-sent events
* Fix heatmap background image not appearing with the first
  click on the Floorplan tab
* ~~"Pre-flight" button to check all settings prior to making a survey (catches empty password, no iperf3 server)~~ less important now that the tests are quicker to detect failure
* ~~Add "Map lock" to prevent unintended clicks from surveying? (No - canceling will do the same thing.)~~
* **All measurements** are displayed and referenced to
  signal strength (%) and converted back to dBm where necessary.
* `wiFiScanner.ts` ensures that both % & RSSI are always set on return.
  Since Windows measures %, it converts back to RSSI before returning
* _HeatmapSettings_ structure replaces _Database_, and
  holds all prefs (including sudoerPasword)
  in a flat structure so they can be passed around and
  modified by the children
* `fileHandler.ts` always removes sudoerPassword before saving settings
* `GlobalSettings` owns/controls the array of surveyPoints.
  `<Floorplan>` may add or delete a point;
  `<PointsTable>` may remove one or many.
  Both receive the full list of points, and return an updated list back to `GlobalSettings`
* ~~Add slider to heatmap. Always set it to the computed value, unless user has changed it, then remember that value in the global settings. Initialize it to null: a numeric value indicates it has been changed. Sliding the value to 0 should re-set the value to null.~~
* ~~Remove Scale size/radius divider from AdvancedHeatMap settings. All the above logic should remain within the Heatmap component~~
* ~~Retain the "Size Adjustment" setting (and other Advancd Configuration settings?) in the global object~~
* ~~The Wi-Fi signal strength heat map should always display a scale of 0-100% because people deserve to know when their wifi strength is low.~~
* Convert all references to the "advanced settings" of the Floorplan
  to use the `GlobalSettings` object instead of the Floorplan
* Ultimately, `Database` might be called `SiteMap`, since it contains
  all  the info required to reproduce the site's heatmap(s).
  Interim step: rename localStorage() with "wifi-heatmap-IMAGE_NAME"?
* ~~Find out how to get RSSI and other stuff from `ioreg` so sudo is not needed (for `wdutil`)~~ _Likely, not possible_
* ~~Infer the relevant command/OS version and use the relevant commands and parser based on that to make this multi-platform.~~ Done
* ~~Make version 0.2.1 work with Docker (currently gives error attempting to locate the _localization_ directory)~~
* ~~Load/save heatmap config to database~~ 
* Alternative: Save the JSON data to localStorage() with a name like `wifi-heatmapper-floorPlanImagename`, and come up with a means of selecting one or the other. [DONE]
* Create a "Signal strength only" setting for quicker surveys.
  Doing this also removes the requirement of setting up a separate iperf3 server.
  Maybe also triggered by a "" setting for the iperf3 server.
  [DONE]
* If only one survey point exists, the `Heatmap` floor plan should appear, but with a message like "Not enough points"
* Change Floor Plan `<input>` to be a "Browse..." field
* Better yet, let the user drag it into the Floorplan window
* Is it possible to automatically compute the h337 `radius`. Currently using the "bounding box" which is some measure of the point's density. The (new) slide makes this somewhat better, but how do we tell people where "the right setting" is? [DONE]
* How should "saved files" work (now in `localstorage()`)?
  Opening a new Floorplan should probably
  change the saved file name to match [DONE]
* "No TCP (UDP) test" message should be on an opaque/partially transparent background [DONE]
* Long file names should fit inside the dropdown [DONE]
* It could be useful to change iperfRunner.ts to default to "null" results
  for all its values, instead of zero. This indicates that no iperf3 test was run. [NOT DONE]
* Test code from wifiScanner_windows should be moved to a separate \_test.ts file [DONE]
* Make the app more user-friendly and informative (step by step wizard for the measurements) [DONE for now]
* Add leaflet to make the maps interactive [NOT FOR NOW]
