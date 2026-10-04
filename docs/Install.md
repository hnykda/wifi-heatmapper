# Installing the app

WiFi Heatmapper comes as a desktop app for macOS, Windows and Linux. It has
everything it needs built in: no Node.js, no terminal, no `npm`.

> **The desktop apps are new and have barely been tested.** They are built
> automatically for every release, but so far only the macOS build has been
> used on a real computer, and only on one Mac. See
> [what has been tested](#what-has-been-tested) and please
> [tell us how it went](#tell-us-how-it-went), good or bad.
> If the app gives you trouble, [running from source](../README.md#run-from-source)
> still works exactly as before.

- [macOS](#macos)
- [Windows](#windows)
- [Linux](#linux)
- [iperf3 for throughput tests](#iperf3-for-throughput-tests)
- [What has been tested](#what-has-been-tested)

## macOS

Needs macOS 11 or later. Download from the
[latest release](https://github.com/hnykda/wifi-heatmapper/releases/latest):

| Your Mac | File |
|---|---|
| Apple silicon (M1 and later) | `WiFi.Heatmapper_<version>_aarch64.dmg` |
| Intel processor | `WiFi.Heatmapper_<version>_x64.dmg` |

Not sure which? Apple menu → About This Mac → "Chip" says Apple M-something
or Intel.

Open the `.dmg` and drag WiFi Heatmapper to Applications.

Or use [Homebrew](https://brew.sh), which also installs iperf3:

```bash
brew install --cask hnykda/tap/wifi-heatmapper
```

### The first time you open it

The app is not signed by Apple (that needs a paid developer account), so macOS
stops it the first time:

1. Open WiFi Heatmapper. macOS says it could not verify that the app is free
   of malware. Click **Done**.
2. Open System Settings → Privacy & Security, scroll down and click
   **Open Anyway** next to WiFi Heatmapper. Confirm with your password.

Or, in Terminal: `xattr -dr com.apple.quarantine "/Applications/WiFi Heatmapper.app"`

You will have to do this again after each update, for the same reason.

### Location access

macOS only tells apps the name of your Wi-Fi network if they have Location
access. In the app's Settings tab, click **Allow Location access**; macOS
asks whether **WiFi Heatmapper Helper** may use your location. Click
**Allow**. The helper is the small part of the app that reads
the Wi-Fi signal. It never looks up where you are.

If you say no, everything still works, but surveys record the network name
as unknown. Updates keep the permission, so you are asked only once. You can change your mind in System Settings → Privacy & Security →
Location Services.

You do not need a sudo password in the app.

### Where your data is

Surveys and floor plans: `~/Library/Application Support/com.github.hnykda.wifi-heatmapper/data`
Log: `~/Library/Logs/com.github.hnykda.wifi-heatmapper/server.log`

Deleting the app leaves these in place. `brew uninstall --zap --cask wifi-heatmapper`
removes them.

## Windows

Windows 10 or 11, x64. Download from the
[latest release](https://github.com/hnykda/wifi-heatmapper/releases/latest):

| Installer | Installs for | Admin rights |
|---|---|---|
| `WiFi.Heatmapper_<version>_x64-setup.exe` (recommended) | you only | not needed |
| `WiFi.Heatmapper_<version>_x64_en-US.msi` | everyone on the computer | needed |

Pick one and stick with it: installing one after the other can put the app in
an unexpected folder.

The installers are not signed, so Windows SmartScreen says it protected your
PC: click **More info**, then **Run anyway**.

### Location access

On Windows 11 24H2 and later, Windows only shares Wi-Fi details with apps that
may use your location. Open Settings → Privacy & security → Location and turn
on **Location services** and **Let desktop apps access your location**.
Windows does not ask by itself here; if this is off, the app tells you when
you measure.

### iperf3

Install it so it is on your `PATH`, for example `scoop install iperf3` or
`choco install iperf3`. The app finds iperf3 installed by winget, Scoop or
Chocolatey.

### Where your data is

Surveys and floor plans: `%LOCALAPPDATA%\com.github.hnykda.wifi-heatmapper\data`
Log: `%LOCALAPPDATA%\com.github.hnykda.wifi-heatmapper\logs\server.log`

Uninstalling leaves these in place.

## Linux

Builds are for x64 and 64-bit ARM (Raspberry Pi 4 and 5 with a 64-bit OS).
Download from the [latest release](https://github.com/hnykda/wifi-heatmapper/releases/latest):

| Your system | File |
|---|---|
| Ubuntu, Debian, Linux Mint (x64) | `WiFi.Heatmapper_<version>_amd64.deb` |
| Raspberry Pi OS 64-bit, Ubuntu, Debian (ARM64) | `WiFi.Heatmapper_<version>_arm64.deb` |
| Any other distribution (x64) | `WiFi.Heatmapper_<version>_amd64.AppImage` |
| Any other distribution (ARM64) | `WiFi.Heatmapper_<version>_aarch64.AppImage` |

Install the `.deb`, then start WiFi Heatmapper from the app menu:

```bash
sudo apt install ./WiFi.Heatmapper_*.deb
```

Or run the AppImage:

```bash
chmod +x WiFi.Heatmapper_*.AppImage
./WiFi.Heatmapper_*.AppImage
```

AppImages need FUSE 2. On Ubuntu 24.04 and later install it with
`sudo apt install libfuse2t64` (older Ubuntu: `libfuse2`).

The app reads the signal with `iw` and `nmcli` (the `.deb` suggests both).
On most systems that works without a password; if it doesn't, Settings asks
for your sudo password, which is kept in memory only.

Surveys and floor plans: `~/.local/share/com.github.hnykda.wifi-heatmapper/data`
Log: `~/.local/share/com.github.hnykda.wifi-heatmapper/logs/server.log`

## iperf3 for throughput tests

Signal strength works out of the box. To also measure speed you need
[iperf3](https://iperf.fr/iperf-download.php) on this computer and on a second
computer on your network, ideally wired, running `iperf3 -s`. Homebrew and the
`.deb` install it for you on this computer. See
[measuring throughput](../README.md#measuring-throughput-with-iperf3-optional).

## What has been tested

Honest status for the first desktop release. "CI" means GitHub's build
machines: the app is built there, and on Windows and Linux it is also
installed, started with fake measurements and checked automatically. Nobody
has used it there, and those machines have no Wi-Fi.

| Build | Built in CI | Starts in CI | Used on a real computer |
|---|---|---|---|
| macOS, Apple silicon | yes | – | one Mac (macOS 27): installed, opened past the warning, Location allowed, real Wi-Fi readings without sudo |
| macOS, Intel | yes | – | not yet |
| Windows x64 `.exe` / `.msi` | yes | yes, both installers | not yet |
| Linux x64 `.deb` / AppImage | yes | yes, also in Ubuntu 22.04 and 24.04 containers | not yet |
| Linux ARM64 `.deb` / AppImage | yes | yes | not yet, no Raspberry Pi tried |
| Homebrew cask | – | – | installed and removed from a local build |

Not tested anywhere yet: a full survey with a real iperf3 server in the
desktop app, the Windows app on a real PC (its window, SmartScreen, Wi-Fi),
Windows 10 and Windows on ARM, Linux on real hardware (GNOME, KDE, Wayland),
Intel Macs, and updating from one release to the next.

## Tell us how it went

Even "it worked" helps. Open an issue with the
[desktop app report](https://github.com/hnykda/wifi-heatmapper/issues/new?template=desktop-app-report.md)
template: your OS and version, which file you installed, and what worked or
didn't. Attach the log from the paths above if something went wrong.
