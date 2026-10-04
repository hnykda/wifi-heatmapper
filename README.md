# Wi-Fi Heatmapper

**wifi-heatmapper** measures Wi-Fi signal strength and network throughput
where you stand, and draws heat maps of the results on your floor plan.
Walk around with a laptop, click where you are, and see which rooms have a
weak signal, where a mesh node or extender would help, and whether a slow
connection is really the Wi-Fi's fault.

Runs on **macOS, Windows and Linux** (and in Docker on Linux).
Everything stays on your computer: surveys are plain JSON files.

![Signal strength heat map](docs/images/heatmap.jpg)

Green is good. The scale runs green, turquoise, blue for acceptable signal,
then yellow and red where it gets poor.

## Install the app

Download the app for your computer from the
[latest release](https://github.com/hnykda/wifi-heatmapper/releases/latest):
a `.dmg` for macOS, an installer for Windows, a `.deb` or AppImage for Linux.
Nothing else to install, except iperf3 if you want to measure speed.

On a Mac you can use [Homebrew](https://brew.sh) instead, which also installs
iperf3:

```bash
brew install --cask hnykda/tap/wifi-heatmapper
```

The apps are not signed, so macOS and Windows warn you the first time you open
them. [docs/Install.md](docs/Install.md) walks through that for each system,
plus where your data is kept.

On a Mac, click **Allow Location access** in Settings once: macOS then lets
the app see your network's name. Your location itself is not used, and
updates keep the answer.

> **Early builds.** The desktop apps are new. They are built and started
> automatically on every release, but so far only the macOS app has been used
> on a real computer (one Mac). [Here is exactly what has been tested](docs/Install.md#what-has-been-tested).
> If you try one, please
> [tell us how it went](https://github.com/hnykda/wifi-heatmapper/issues/new?template=desktop-app-report.md),
> even if it just worked. Running from source, below, works as before.

## Run from source

You need Node.js 20 or newer (`node --version`).

```bash
git clone https://github.com/hnykda/wifi-heatmapper.git
cd wifi-heatmapper
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and:

1. **Settings.** Pick the built-in floor plan or upload your own (a photo of a
   sketch is fine, see the [FAQ](docs/FAQ.md)). On macOS and Linux enter your
   sudo password: the OS needs it to read the signal. It is never saved.
2. **Floor plan.** Stand somewhere, click that spot. Signal strength (and
   throughput, if you set up iperf3) is measured and a coloured dot appears.
   Do this in every room, twice in big ones.
3. **Heat maps.** Adjust the radius until the spots merge. Download the map.
4. **Survey points.** Check, switch off or delete individual measurements,
   or export everything as CSV.

Linux needs `iw` and `nmcli` installed and on `PATH`.

On macOS you can skip the sudo password: run `npm run build:macos-helper` once
(needs the Xcode command line tools) and restart `npm run dev`. The Wi-Fi
helper reads the signal without sudo; allow it Location access in Settings to
also record the network name. See
[native/macos-wifi-helper](native/macos-wifi-helper/README.md).

![Floor plan with survey points](docs/images/floorplan.png)

### Measuring throughput with iperf3 (optional)

Signal strength alone tells you where the Wi-Fi is weak. Throughput tells
you how fast it actually is.

1. Install `iperf3` on the laptop (`iperf3 --version` should work).
   Note: tools called `iperf` or `iperf2` are different and incompatible.
2. Install `iperf3` on another computer on your network, wired if possible
   (a desktop, a Raspberry Pi, a NAS), and start it with `iperf3 -s`.
3. In Settings, enter that computer's address as the iperf3 server.

Each measurement then also runs TCP and UDP tests in both directions.
The commands can be changed under Settings if you need other options.

### Try it without any hardware

```bash
npm run dev:mock
```

Mock mode fakes the measurements so you can explore the app, or work on it,
on any machine without sudo, iperf3 or even a Wi-Fi card. The header shows
a "Mock data" badge while it is on.

## Docker (Linux hosts only)

The container has to reach the host's Wi-Fi adapter, which is only possible
on Linux. On macOS and Windows run the app directly.

```bash
docker build -t wifi-heatmapper .
docker run --net=host --privileged \
  -v ./datas:/app/data \
  -v /var/run/dbus:/var/run/dbus \
  wifi-heatmapper
```

Surveys and floor plans are kept in `./datas` on the host. NetworkManager
inside the container talks to the host over D-Bus, hence the second mount.
No sudo password is needed in Docker.

## Documentation

- [Installing the app](docs/Install.md), per system, and what has been tested
- [User interface](docs/User_Interface.md), tab by tab
- [Theory of operation](docs/Theory_of_Operation.md): which commands run on
  each OS, how the heat map is computed
- [FAQ](docs/FAQ.md): floor plans, `<redacted>` SSIDs on macOS, and more
- [Changelog](CHANGELOG.md)

## Reporting a problem

Open an [issue](https://github.com/hnykda/wifi-heatmapper/issues/new/choose).
Include the details from the About dialog (the "i" button in the header) and,
if you can, a log:

```bash
LOG_LEVEL=2 npm run dev | tee out.log
```

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
setup, the test suites and what a PR needs. Every PR needs evidence it was
tested: automated tests, or a screenshot and a note on which OS you tried it.

## History and credits

Inspired by [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap).
@hnykda started this version to get heat maps on a Mac with a browser UI;
@richb-hanover built the four-tab interface and much of the platform support.
The heat map renderer uses WebGL inverse-distance weighting contributed in
[#35](https://github.com/hnykda/wifi-heatmapper/pull/35).

An early [screen recording](https://www.youtube.com/watch?v=pXlm-eWaJCs)
shows the original single-page version (with the opposite colour scheme).
