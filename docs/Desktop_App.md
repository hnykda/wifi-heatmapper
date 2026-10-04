# Desktop app plan

Goal: people download an app for their OS from GitHub Releases and double-click
it. No Node, no npm, no terminal. Builds are unsigned for now.

`npm run dev` and `npm run build && npm start` in a browser keep working exactly
as today. The desktop app is a second way to run the same server, not a fork of it.

## Shape

```
WiFi Heatmapper.app / .exe / .AppImage
├── Tauri shell (Rust)        window + process manager, ~3 MB
└── resources/server/         assembled by desktop/build-server.mjs
    ├── node(.exe)            official Node build, version pinned in build-server.mjs
    ├── server-entry.mjs      exits when the shell goes away, then loads server.js
    ├── server.js, .next-desktop/, node_modules/
    │                         Next's `output: "standalone"` build
    ├── public/, assets/, data/localization/
    └── helpers/              native helpers, e.g. the macOS Wi-Fi reader (part 5)
```

On launch the shell picks a free port on 127.0.0.1, starts
`node server-entry.mjs` with `cwd` set to the server directory,
`WIFI_HEATMAPPER_DATA_DIR` set to the platform app-data folder (the bundle is
read-only) and `WIFI_HEATMAPPER_RESOURCES_DIR` set to the server directory,
shows a small "starting" page, then navigates the window to the server.
Quitting the app stops the server (and anything it is running); if the shell
dies instead, the server sees its stdin close and exits. The full contract is
in CONTRIBUTING.md ("Desktop app (development)").

Sizes for 0.5.0 on Apple silicon: `.app` 167 MB, `.dmg` 52 MB. Most of it is
the Node binary (108 MB uncompressed).

This is the pattern from nooklet (`apps/desktop`), minus what nooklet needs
and this app doesn't: no esbuild bundling (Next's standalone output is
already self-contained), no plugins, no remote-server mode.

## What stays external

- **iperf3** is still installed by the user, for now. The app already reports
  when it's missing. Bundling it per platform is a later, optional step.
- **sudo** on macOS when the native reader is unavailable, and on Linux only
  where `iw dev <if> link` refuses a normal user (see below). The existing
  in-app password field keeps working.

## Native Wi-Fi reading on macOS

macOS hides the SSID/BSSID from `wdutil` (`<redacted>`), and `wdutil` needs
root. CoreWLAN gives RSSI, noise, channel, band, tx rate, scan results, and
the SSID/BSSID once the calling app has Location permission, all without root.

A small Swift helper wrapped in a minimal `.app` (Location permission is granted
per app bundle) prints JSON. The macOS scanner uses it when present and falls
back to `wdutil` + sudo when it isn't. The helper path comes from an env var, so:

- in the desktop app, the bundled helper is used;
- in browser mode, `npm run build:macos-helper` builds it into the repo and
  `npm run dev` picks it up.

What we learned building it (details and log evidence in
[`native/macos-wifi-helper/README.md`](../native/macos-wifi-helper/README.md)):

- Running `WiFiHeatmapperHelper.app/Contents/MacOS/WiFiHeatmapperHelper`
  directly from node is enough. locationd registers the client under the
  helper's bundle id, not the terminal's or node's, and `open` is not needed.
  The helper also re-executes itself with responsibility disclaimed, as a
  precaution.
- An ad-hoc signed bundle gets the real Location prompt, naming "WiFi
  Heatmapper Helper" and showing our usage string. Someone has to click
  "Allow" once; the Settings tab offers a button that triggers the prompt.
- Without Location, readings (RSSI, noise, channel, band, width, tx rate, PHY
  mode, security) still work; only SSID/BSSID are missing, and the UI says so.
- `info` takes ~90 ms, so readings are faster than `sudo wdutil`. A fresh
  `scan` takes 5-7 s, so the server only uses the cached scan.
- Verified on macOS 27: after "Allow", the SSID and BSSID come through. The
  helper must check in as an app (`NSApplication.shared`) before reading.
- An ad-hoc signed helper loses the permission on every rebuild (new cdhash).
  Part 5 signs it with a stable self-signed certificate so updates keep it.

## Linux

Two packages per architecture (x64 built on `ubuntu-22.04`, arm64 on
`ubuntu-22.04-arm`, so glibc 2.35+: Ubuntu 22.04+, Debian 12+, Raspberry Pi
OS 64-bit bookworm+, current Fedora/Arch):

- **`.deb`**: installs to `/usr/bin/wifi-heatmapper` and
  `/usr/lib/WiFi Heatmapper/server/`; the package is called
  `wi-fi-heatmapper` (Tauri derives it from the product name).
  Depends on `libwebkit2gtk-4.1-0`, `libgtk-3-0`; Recommends `iw`,
  `iperf3`, `network-manager`. Menu entry in Network and Utility.
- **`.AppImage`**: bundles webkit2gtk/GTK. Needs FUSE 2 (`libfuse2t64` on
  Ubuntu 24.04+) or `APPIMAGE_EXTRACT_AND_RUN=1`.

Config lives in `desktop/src-tauri/tauri.linux.conf.json` (Tauri merges it on
Linux only) and `desktop/src-tauri/linux/wifi-heatmapper.desktop`.

Data: `~/.local/share/com.github.hnykda.wifi-heatmapper/data`
(`$XDG_DATA_HOME`); server log: `.../com.github.hnykda.wifi-heatmapper/logs/server.log`.
WebKit's own cache sits next to them.

What we learned:

- The AppImage's AppRun sets `LD_LIBRARY_PATH`, `GIO_MODULE_DIR`,
  `XDG_DATA_DIRS`, `GTK_*`, `PATH` and more to point into the bundle. The
  shell strips those `$APPDIR` entries before starting node, so `nmcli`,
  `iw`, `sudo` and `iperf3` run against the system's libraries.
- linuxdeploy inspects every ELF file in the AppDir, including
  `node_modules`; Next's optional `sharp` ships musl builds that make it fail.
  The app doesn't use `next/image`, so `build-server.mjs` leaves sharp out
  (-33 MiB on every platform).
- Executable bits survive both packages (`node` is `0755` in the squashfs
  and in `/usr/lib`). Resources resolve through Tauri's `resource_dir()`,
  which handles `$APPDIR`; nothing is written into the bundle.
- `PATH` gets `/usr/local/bin`, `/usr/sbin`, `/sbin` appended (part 1), so
  `iw` is found when the app starts from the menu.
- Wi-Fi: `iw dev <if> link` only reads nl80211 state, which the kernel allows
  for any user, so the Linux scanner now tries it without sudo first and only
  falls back to `sudo -S` when a password is set; the preflight only asks for
  a password when the unprivileged read fails. `nmcli dev wifi list` (the
  nearby-network list) already ran without sudo (NetworkManager's cached
  scan). Not verified on real Linux hardware yet.
- CI (`desktop/smoke-test-linux.sh`) starts the real app under Xvfb in mock
  mode from the AppImage and from the installed `.deb`, and checks the UI,
  APIs, the server's environment, and that no node is left after a SIGTERM.
- Sizes for 0.5.0 on arm64: `.AppImage` 120 MiB, `.deb` 53 MiB.

## Releases

`.github/workflows/release.yml`, on a `v*` tag (and `workflow_dispatch` for
trial runs), builds with `tauri-apps/tauri-action` and attaches everything to a
draft GitHub release:

| Platform | Runner | Artifacts |
|---|---|---|
| macOS Apple Silicon | `macos-latest` | `.dmg` |
| macOS Intel | `macos-15-intel` (`macos-13` was retired in Dec 2025) | `.dmg` |
| Windows x64 | `windows-latest` | `.msi`, NSIS `.exe` |
| Linux x64 | `ubuntu-22.04` | `.AppImage`, `.deb` |
| Linux arm64 | `ubuntu-22.04-arm` | `.AppImage`, `.deb` |

Release notes explain the unsigned-app warnings: macOS needs System Settings →
Privacy & Security → "Open Anyway" (or
`xattr -dr com.apple.quarantine "/Applications/WiFi Heatmapper.app"`), and Windows
needs SmartScreen → "More info" → "Run anyway".

## Work breakdown

Each part is its own PR. The base is either the `desktop-app` tracking PR or
the part it depends on.

| # | Part | Depends on | Verified by |
|---|---|---|---|
| 1 | Foundation: standalone server bundle, Tauri shell, app-data dir, macOS build, release workflow (macOS jobs) | - | local `.dmg` launches and runs a mock survey |
| 2 | macOS native Wi-Fi helper (CoreWLAN), used by browser mode and the app | - | real readings on this Mac with SSID unredacted, parser fixtures |
| 3 | Windows packaging + release job | 1 | `workflow_dispatch` run produces an installer; CI smoke test starts the bundled server |
| 4 | Linux packaging + release job | 1 | same, `.AppImage` and `.deb` |
| 5 | Ship the macOS helper inside the app (Info.plist usage string, Location prompt, bundle layout) | 1, 2 | packaged `.dmg` reads unredacted SSID without sudo |
| 6 | README "Download" section, version bump, first tagged release | all | draft release has every artifact |

Later, optional: bundle iperf3; native Windows Wi-Fi API (PR #85 already
explores this); code signing once a certificate exists.

## Checklist

- [x] 1 Foundation
- [x] 2 macOS native Wi-Fi helper
- [ ] 3 Windows
- [x] 4 Linux (x64 and arm64; real Wi-Fi on Linux hardware not yet tested)
- [ ] 5 macOS helper in the app
- [ ] 6 Docs and first release
