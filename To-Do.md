# To-Do

* Only use (percentage) signal strength to create colors
  (heat map & coloring survey dots)
* Update labels on survey dots to show more interesting info (not "00000000")
* Remove pulsing aura's when not actively sampling (or always?)
* Update the Toast progress indicators to stay on-screen during entire survey process. Display:
  * Starting measurement... X seconds remaining (and count down)
  * Signal level is XX dBM / %
  * Starting download / Download is XX
  * Starting upload test / Upload is XX
  * Survey is complete... Leave on screen for 5 seconds or so
* Create a "Signal strength only" setting for quicker surveys.
  (And to remove the requirement for setting up a separate iperf3 server.)
* Better error message when initially starting survey (empty password)
* "Pre-flight" all settings prior to making a survey (catches empty password)
* Retain the "Size Adjustment" setting (and other Advancd Configuration settings?)
* "Adjust the size of the heat spots to MATCH..."
* Come up with a better mechanism for naming survey points (than random strings)
* It's odd that "Floorplan Image" can be empty and show a floor plan...
* Does a mDNS name work for the iperf3 server address?
* What _does_ **Access Point Mappings** do?
* Normalize data rate scale for throughput (not range of 673mbps .. 245mbps)
* Clicking a heat map (signal strength or data rate) and clicking Back should not give https error
* An expanded (clicked) heat map should fit fully within the browser window
* Clicking in Password field should select; pressing Return should accept
* Setting browser to 110% should not disarrange click points
  for survey data
* Improve "fetch error" message when the web GUI has lost contact
  with the server (perhaps because `npm run dev` has been stopped)
* Start with "Survey 1" as the name of the database file
  so that it can be renamed
* 

## Questions

* Is there a difference between using the currently subscribed SSID
  and using the sum of all SSIDs?
* What's the best gradient for signal strength? Linear between -40 and -80 dBM?
  Emphasize differences between good (-40 to -60?) Emphasize the bad?
  Good rule might be "green or above (yellow, orange, red) is good...
* Can heat map colors go (good to bad)
  Green - Turquoise - Blue - Yellow - Red
  to comport with "normal meanings"? (Rule might be blue or above...)
* I think the magic of this heat map system is that if drawing
  is not actually to scale it'll still give good info - relative signal
  strength relative to other places on the drawing
* How to reconcile difference between signal strength and throughput rates?
  (especially in the front room...)
* Would it improve the signal strength heat map to indicaate the points where
  measurements were made? As it is, there are 'holes' that occur simply because
  no samples were taken there...
* ~~In Heatmaps.tsx, line 221, ask person for estimated size of background image and use that to set Radius_divider~~
* Autocompute `Radius_Divider`:
  The answer on my map is 5. It has something to do
  with the average space points occupy.
  Currently using sqrt (h x w / #points)
* ~~Add "Map lock" to prevent unintended clicks from surveying? (No - canceling will do the same thing.)~~
