# User Interface

The **wifi-heatmapper** user interface has a number of tabs.

## Settings Pane

* **Floor Plan** is a dropdown showing the current floor plan image
  and the images available.
  Use _Upload an image..._ to add to the list.
  The selected image is displayed as a background behind both
  the Floor Plan pane and the heatmaps.
* **iperfServer** - address or DNS name for the "iperf3 server".
  To disable iperf3 tests, set this to "localhost"
* **Test duration** - in seconds. Defaults to one second.
* **sudo Password** - required for macOS and Linux

**Advanced Configuration** -
these settings do not normally need to be modified

* **Max Opacity** - _need more description_
* **Min Opacity**  - _need more description_
* **Blur** - _need more description_
* **Gradient** - _need more description_

![Settings Pane](images/SettingsPane.png)

## Floor Plan Pane

Use this pane to collect the measurements.
Click on a point on the floor plan to make a measurement.
Move the laptop to other locations and make additional measurements.
A good strategy is to make multiple measurements per room.

This image shows the survey points collected to produce the heat map below.

![Floor Plan](images/FloorPlanPane.png)

## Heat Maps Pane

The Heat Maps tab displays the heat map.
The Radius slider controls the "radius" of the individual
measurements.
Adjust the slider so that the points merge in the heatmap.

![Heatmap Pane](images/HeatmapPane.png)

## Survey Points Pane

The Survey Points pane displays information about
all the points that have been collected.
Enable or disable points, or delete one or many points at one time.

![Survey Points Pane](images/SurveyPointsPane.png)
