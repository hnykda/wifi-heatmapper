# To-Do

Random questions that arise at the start of the project

* Update the Toast progress indicators to stay on-screen during entire survey process. Display:
  * Starting measurement... X seconds remaining (and count down)
  * Signal level is XX dBM / %
  * Starting download / Download is XX
  * Starting upload test / Upload is XX
  * Survey is complete... Leave on screen for 5 seconds or so
* Create a "Signal strength only" setting for quicker surveys.
  It also removes the requirement of setting up a separate iperf3 server.
* Need better error message when initially starting survey (empty password) on macOS
* "Pre-flight" button to check all settings prior to making a survey (catches empty password, no iperf3 server)
* Retain the "Size Adjustment" setting (and other Advancd Configuration settings?) in the global object
* Come up with a better mechanism (than random strings) for naming survey points 
* What _does_ **Access Point Mappings** do?
* Normalize data rate scale for throughput (use range of 200..700mbps with 100's dividers instead of 245..673mbps)
* Clicking a heat map (signal strength or data rate) and clicking Back should not give http error
* An expanded (clicked) heat map should always fit fully within the browser window (or scroll)
* Clicking in Password field (and other fields) should select the field for editing; pressing Return should accept the new value
* Setting browser view to 110% should not disarrange click points
  for survey data
* Improve "fetch error" message when the web GUI has lost contact
  with the server (perhaps because `npm run dev` has been stopped)
* Coalesce all the settings into a single object that can then be saved to a file. (Remember to isolate the sudoer password - never save it).
* If only one survey point exists, the <Heatmap> floor plan should appear, but with a message like "Not enough points"
* The signal strength heat map should always have a scale of 0-100% because people deserve to know when their wifi strength is low.
* If `Floorplan` cannot open the image, it should display a sensible message
* Change Floor Plan `<input>` to be a "Browse..." field
* Change Password field to conceal the characters

## Questions

* What's the best gradient for signal strength? Linear between -40 and -80 dBM?
  Emphasize differences between good (-40 to -60?) Emphasize the bad?
  Good rule might be "green or above (yellow, orange, red) is good...
* I think the magic of this heat map system is that if drawing
  is not actually to scale it'll still give good "relative strength" info
  relative to other places on the drawing
* How to reconcile difference between signal strength and throughput rates?
* Autocompute `Radius_Divider`:
  The answer on my map is 5. It has something to do
  with the average space points occupy.
  Might experiment with something like `divider = sqrt(h x w / #points)`
* Does "winking" WiFi off and then back on before measurement improve the values?
* How should "saved files" work (not in `localstorage()`)?
  Opening a new Floorplan should probably 
  change the saved file name to match


## Decisions

* _HeatmapSettings_ replaces _Database_, and
  holds all prefs (including sudoerPasword)
  in a flat structure so they can be passed around and
  modified by the children
* `fileHandler.ts` removes sudoerPassword before saving
* Don't dislay Platform in the Settings Pane
* Obviously `wifiScanner.ts` must determine the platorm,
  but none of the other code needs to know the platform.
  We can decide on-the-fly when `platform` is needed
* `wifiScanner` must throw quickly if sudoerPassword is _empty_
* `GlobalSettings` owns/controls the array of surveyPoints.
  `<Floorplan>` may add or delete a point;
  `<PointsTable>` may remove one or many.
  Both receive the full list of points, and return an updated list back to `GlobalSettings`

## DONE

* ~~Only use (percentage) signal strength to create colors
  (heat map & coloring survey dots)~~
* ~~Update labels on survey dots to show more interesting info (not "00000000")~~
* ~~Remove pulsing aura's when not actively sampling (or always?)~~
* ~~Is there a difference between using the currently subscribed SSID and using the sum of all SSIDs?~~ Yes. `wifi-heatmapper` only uses the current SSID, and doesn't see other SSIDs.
* ~~It's odd that "Floorplan Image" can be empty and show a floor plan...~~
* ~~Does a mDNS name work for the iperf3 server address?~~ Yes
* ~~Uncontrolled input: https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable~~ Done (I think) by setting sudoerPassword after reading other settings from a file
* ~~Alternative: Different color scale: Can heat map colors go (good to bad) _Green - Turquoise - Blue - Grey - Yellow - Red_ to comport with "normal meanings" of "Green is good, red is bad"? (Advice would then be blue or above is OK...) Grey could then be a narrow band (numeric range) between blue and yellow that is the divider between good and not-so-good~~ Done.
