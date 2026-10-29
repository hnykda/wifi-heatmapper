---
title: Running from source
description: Run the app with Node.js instead of the desktop app, in mock mode, or in Docker on Linux.
order: 6
---

# Running from source

The desktop app is the easiest way in, but the same app runs from a clone of
the repository in any browser.

You need Node.js 22.12 or newer (`node --version`).

```bash
git clone https://github.com/hnykda/wifi-heatmapper.git
cd wifi-heatmapper
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow
[your first survey](getting-started.md#your-first-survey).

You can also open it by this computer's LAN address (the `Network:` line
that `npm run dev` prints) or a `.local` or `.lan` name, on this or another
device on your network. A one-word host name such as `http://nas:3000`
needs `WIFI_HEATMAPPER_ALLOWED_HOSTS=nas npm run dev`; without it the page
loads but its buttons do nothing.

What else each system needs:

- **macOS:** enter your sudo password in Settings: `wdutil` needs it to read
  the signal. The app's server keeps it in memory until you stop the app,
  and never saves it. To skip the password,
  run `npm run build:macos-helper` once (needs the Xcode command line tools)
  and restart `npm run dev`. The Wi-Fi helper reads the signal without sudo;
  allow it Location access in Settings to also record the network name. See
  [native/macos-wifi-helper](https://github.com/hnykda/wifi-heatmapper/blob/main/native/macos-wifi-helper/README.md).
- **Windows:** nothing; the app uses the Native Wifi API that is part of
  Windows.
- **Linux:** `iw` installed and on `PATH`. `nmcli` (NetworkManager) is
  optional and only lists nearby networks. If reading the signal needs root,
  Settings asks for your sudo password, which is kept in memory only.

For speed tests, see [measuring speed](throughput.md).

## Try it without any hardware

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
No sudo password is needed in Docker. The app sends
[anonymous usage counts](privacy.md); add `-e WIFI_HEATMAPPER_TELEMETRY=0`
to turn them off.

The app only answers requests addressed to `localhost`, an IP address, a
one-word host name (`nas`) or a local name (`nas.local`, `.lan`,
`.home.arpa`), so other web sites can't drive it. To open it under another
name, add `-e WIFI_HEATMAPPER_ALLOWED_HOSTS=heatmap.example.com`.

## Where the data is

In `data/surveys/<floor plan name>.json` next to the app, one file per floor
plan, plus the images in `data/media/`. Copy the `data` folder to back up or
move a survey. Set `WIFI_HEATMAPPER_DATA_DIR` to keep it elsewhere.

## Logs

Set `LOG_LEVEL` to see every command the server runs and its output:
`2` is debug, `1` is trace.

```bash
LOG_LEVEL=2 npm run dev | tee out.log
```

On Windows (Command Prompt): `set LOG_LEVEL=2` and then `npm run dev`.
Attach that log to a bug report.
