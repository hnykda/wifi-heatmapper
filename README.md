# Wi-Fi Heatmapper

**See where your Wi-Fi is weak.**

Walk around with a laptop and click where you stand on your floor plan:
Wi-Fi Heatmapper measures the Wi-Fi signal there, and optionally the real
speed. A few rooms later you have a Wi-Fi coverage map of your home or
office: heat maps that show the dead zones, which rooms need a mesh node or
an extender, and whether a slow connection is really the Wi-Fi's fault.
A free, open-source (MIT) Wi-Fi site survey tool for macOS, Windows and
Linux.

**Website and guide: <https://wifi-heatmapper.danielalder.cz>**

![The Heat maps tab: signal strength and download speed heat maps over a house and garage, green near the house, yellow and blue toward the garage](docs/images/heatmaps.png)

## Download

| System | Get it |
| --- | --- |
| **macOS** 13.5 (Ventura) or later | `.dmg` for Apple silicon or Intel from the [latest release](https://github.com/hnykda/wifi-heatmapper/releases/latest), or `brew install --cask hnykda/tap/wifi-heatmapper` (installs iperf3 too) |
| **Windows** 10 and 11, x64 | `-setup.exe` (just you) or `.msi` (everyone) from the [latest release](https://github.com/hnykda/wifi-heatmapper/releases/latest) |
| **Linux** x64 and ARM64 | `.deb` or AppImage from the [latest release](https://github.com/hnykda/wifi-heatmapper/releases/latest) |
| **Docker** (Linux hosts) | `docker build -t wifi-heatmapper .`, then [run it with host networking](docs/guide/run-from-source.md#docker-linux-hosts-only) |
| **From source** | Node.js 22.12 or newer: `git clone https://github.com/hnykda/wifi-heatmapper.git`, `npm install`, `npm run dev` ([more](docs/guide/run-from-source.md)) |

The apps are not signed yet, so macOS and Windows warn you the first time:
[Installing the app](docs/guide/install.md) shows what to click. On an
older Mac, run it from source.

## Quick start

1. **Settings:** pick the bundled floor plan or upload your own. A phone
   photo of a pencil sketch is fine.
2. **What to measure:** leave it at **Signal only**, or choose **Signal and
   speed** (see below).
3. **Floor plan:** stand somewhere and click that spot. A coloured dot
   appears. Do this in every room.
4. **Heat maps:** drag the radius until the dots merge into one map, then
   download the maps you need.

[Getting started](docs/guide/getting-started.md) has the details.

## Signal only, or signal and speed?

**Signal only** needs nothing else and takes about 2 seconds a spot: it
shows where coverage is weak. **Signal and speed** also measures download
and upload speed against a second computer wired to your router (with
iperf3), so you see what you actually get. See
[Measuring speed](docs/guide/throughput.md).

## Use it with an AI agent

An optional [MCP](https://modelcontextprotocol.io) server lets Claude Code,
Claude Desktop or another agent read and explain your surveys, set up a new
one, and walk you through measuring it while you carry the laptop: it says
where to go, measures once you confirm, and tells you the result. It only
talks to the app on your computer and never sees your sudo password.

```bash
npm run mcp:build
claude mcp add wifi-heatmapper -- node "$PWD/dist/mcp/wifi-heatmapper-mcp.mjs"
```

The desktop app ships it too. Setup for every client:
[Using it with an AI agent](docs/guide/mcp.md).

## Privacy

Your surveys stay on your computer, as plain JSON files. The app sends only
anonymous usage counts (installs, app starts, number of measurements; never
network names, addresses or results): I build it on my own, and they tell me
it's used. Turn them off in Settings any time, or see exactly what is sent in
[Privacy and usage counts](docs/guide/privacy.md).

## Found a bug? Please report it

Wi-Fi works differently on every system and version, and I can't test them
all, so your report really helps. In the app, click the **?** in the
bottom-right corner and choose **Report a problem**: it opens a GitHub issue
with your system and the app's diagnostics filled in, with the sudo password,
network names and addresses left out
([what's in it](docs/guide/faq.md#something-went-wrong-how-do-i-report-it)).
Tried a desktop app and it just worked?
[Tell us that too](https://github.com/hnykda/wifi-heatmapper/issues/new?template=desktop-app-report.md).

## Guide

- [Getting started](docs/guide/getting-started.md): install and your first survey
- [Installing the app](docs/guide/install.md): per system, first launch, data and log folders, what has been tested
- [Using the app](docs/guide/using-the-app.md): every tab and setting
- [Measuring speed](docs/guide/throughput.md): the second computer and iperf3
- [How it works](docs/guide/how-it-works.md): where readings come from, percent vs dBm, noise, the heat map
- [Running from source](docs/guide/run-from-source.md): Node.js, mock mode, Docker, logs
- [Using it with an AI agent](docs/guide/mcp.md): setup, tools, measuring with an agent
- [FAQ](docs/guide/faq.md)
- [Privacy and usage counts](docs/guide/privacy.md)
- [Changelog](CHANGELOG.md)

The same pages are on the [website](https://wifi-heatmapper.danielalder.cz/docs/getting-started),
and [llms.txt](https://wifi-heatmapper.danielalder.cz/llms.txt) indexes them for AI assistants.

## Contributing

Pull requests are welcome: [CONTRIBUTING.md](CONTRIBUTING.md) has the setup,
the tests and what a PR needs, and [docs/dev](docs/dev) the
[architecture](docs/dev/architecture.md). `npm run dev:mock` runs the whole
app with made-up measurements, so any machine will do.

## History and credits

Inspired by [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap).
@hnykda started this version to get heat maps on a Mac with a browser UI;
@richb-hanover built the four-tab interface and much of the platform support.
The WebGL heat map renderer came in
[#35](https://github.com/hnykda/wifi-heatmapper/pull/35). An early
[screen recording](https://www.youtube.com/watch?v=pXlm-eWaJCs) shows the
original single-page version.
