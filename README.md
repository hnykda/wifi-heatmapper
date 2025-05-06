# WiFi Heatmapper

**wifi-heatmapper** displays heat maps of both
WiFi signal strength and
the results of a network speed (throughput) test.
This is useful for optimizing access point placement,
or knowing where to add new mesh devices or extenders.

**wifi-heatmapper** runs on Windows, macOS, and Linux.

The heat maps use a green color to show areas of strong signal
(or high data transfer speeds).
Acceptable signal levels fade to turquoise, then to blue.
Yellow and red colors indicate poor signal levels.
The screen shot below shows a sample heat map:

![heatmap example](docs/images/HeatmapPane.png)

There are more details about the operation of **wifi-heatmapper** at:

* [User Interface](docs/User_Interface.md)
* [Theory of Operation](docs/Theory_of_Operation.md)
* [FAQ](docs/FAQ.md)
* [To-Do](docs/To-Do.md)

## Usage

**Install wifi-heatmapper** on a laptop computer since you use it
to measure signal strength at various locations.
See [Installation](#installing-and-running) for details.
Then browse to
[http://localhost:3000](http://localhost:3000).

**Settings pane:** Enter the address of an iperf3 server
and provide a sudo password for macOS or Linux.
Leave the other settings at their default to start.

**Switch to the Floor Plan tab.**
You'll see the built-in Empty Floor Plan or your imported image.
_NB: Importing a new background image is currently awkward... Copy the PNG/JPG file to the `public/media` folder on the laptop, then specify its name in the Settings pane._

**Start a measurement** by clicking the floor plan at a point
that reflects the laptop's location.
**wifi-heatmapper** measures the WiFi signal strength and
the throughput at that point.
The floor plan displays a dot colored by its signal stength.
Click the dot to get more information.

**Move to other locations** and make further measuements.
Make at least one measurement per room.
Multiple measurements per room provide more fine-grained data.

**Click the Heatmap tab** to see the resulting heat map.
Areas with strong signal will be green,
lower signal levels will follow the
Green -> Tuquoise -> Blue -> Yellow - Red transition.
Adjust the **Radius** slider until the spots grow together.
Go back to the Floor Plan tab to make more measuements if needed.

**Click the Survey Points tab** to see all the survey points,
with details of the measurements taken.
Remove errant points using this tab.

## Installing and Running

Install **wifi-heatmapper** on a laptop device
so you can move from place to place.
To install the software:

1. Pull the repo, and install the `npm` dependencies.

   ```bash
   git clone https://github.com/hnykda/wifi-heatmapper.git
   cd wifi-heatmapper
   npm install
   ```

2. Install `iperf3` on your laptop.
3. Install `iperf3` on another computer.
   We call this the "iperf3 server".
   This could be a desktop or another laptop,
   or even a Raspberry Pi 4 or 5 on the local network.
4. Start the "iperf3 server" on the other computer with
   `iperf3 -s`
5. Optional checks: Run these on the laptop:
   * Check the local iperf3 binary with `iperf3 --version`
   * Check the iperf3 server with `iperf3 -c address-of-iperf3-server`
6. Browse to [http://localhost:3000](http://localhost:3000)
   and follow the steps at the top of this page

## Usage with Docker

WiFi Heatmapper includes a Dockerfile that automates much of
the installation process.

1. Build the Docker Image

   ```bash
   docker build -t wifi-heatmapper .
   ```

2. Run the Container

   ```bash
   docker run \
   --net="host" \
   --privileged \
   -p 3000:3000 \
   -v ./datas/data:/app/data \
   -v ./datas/media:/app/public/media \
   wifi-heatmapper
   ```

use `-v` options if you want to save db + floorplanpicture to the _datas_ folder

_NB: The Dockerfile does not work on macOS or Windows. See the note in the Dockerfile for more information._

## History

This project is a WiFi heatmapper solution for macOS/Windows/Linux, inspired by [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap). I (@hnykda) wanted to create a heatmap of my WiFi coverage, but the original project didn't work because I am running on Mac. I also wanted just something that might be slightly easier to use, i.e. via browser.

## Screen Recording

This is a video recording of an earlier version of `wifi-heatmapper`.
The basic operation is the same, but looks different now:
all the user interface was in one page,
and it used a different color scheme: red is "hot" (strong signal),
blue was "cool" (weak).

[![showcase recording](https://img.youtube.com/vi/pXlm-eWaJCs/0.jpg)](https://www.youtube.com/watch?v=pXlm-eWaJCs)

## Credits

This project was inspired by [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap). Special thanks to the original author for their work.

## Contributing

Feel free to contribute to this project by opening an issue or submitting a pull request. I am more than happy for that!
