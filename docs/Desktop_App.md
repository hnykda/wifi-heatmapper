# Desktop app plan

Goal: people download an app for their OS from GitHub Releases and double-click
it. No Node, no npm, no terminal. Builds are unsigned for now.

`npm run dev` and `npm run build && npm start` in a browser keep working exactly
as today. The desktop app is a second way to run the same server, not a fork of it.

## Shape

```
wifi-heatmapper.app / .exe / .AppImage
├── Tauri shell (Rust)        window + process manager, ~5 MB
└── resources/server/         assembled by desktop/build-server.mjs
    ├── node(.exe)            the Node runtime the release was built with
    ├── server.js, .next/     Next's `output: "standalone"` build
    ├── assets/, data/localization/
    └── helpers/              native helpers, e.g. the macOS Wi-Fi reader
```

On launch the shell picks a free port on 127.0.0.1, starts
`node server.js` with `cwd` set to the server directory and
`WIFI_HEATMAPPER_DATA_DIR` set to the platform app-data folder (the bundle is
read-only), shows a small "starting" page, then navigates the window to the
server. Quitting the app stops the server.

This is the pattern from nooklet (`apps/desktop`), minus what nooklet needs
and this app doesn't: no esbuild bundling (Next's standalone output is
already self-contained), no plugins, no remote-server mode.

## What stays external

- **iperf3** is still installed by the user, for now. The app already reports
  when it's missing. Bundling it per platform is a later, optional step.
- **sudo** on Linux (`iw`) and on macOS when the native reader is unavailable.
  The existing in-app password field keeps working.

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

## Releases

`.github/workflows/release.yml`, on a `v*` tag (and `workflow_dispatch` for
trial runs), builds with `tauri-apps/tauri-action` and attaches everything to a
draft GitHub release:

| Platform | Runner | Artifacts |
|---|---|---|
| macOS Apple Silicon | `macos-latest` | `.dmg` |
| macOS Intel | `macos-13` | `.dmg` |
| Windows x64 | `windows-latest` | `.msi`, NSIS `.exe` |
| Linux x64 | `ubuntu-22.04` | `.AppImage`, `.deb` |

Release notes explain the unsigned-app warnings: macOS needs System Settings →
Privacy & Security → "Open Anyway" (or
`xattr -dr com.apple.quarantine /Applications/wifi-heatmapper.app`), and Windows
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

- [ ] 1 Foundation
- [ ] 2 macOS native Wi-Fi helper
- [ ] 3 Windows
- [ ] 4 Linux
- [ ] 5 macOS helper in the app
- [ ] 6 Docs and first release
