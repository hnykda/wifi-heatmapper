# macOS Wi-Fi helper

`WiFiHeatmapperHelper.app` is a tiny background app (no Dock icon, no window)
that reads Wi-Fi details with CoreWLAN and prints one JSON document. The server
(`src/lib/wifiScanner-macos.ts`) uses it instead of `sudo wdutil info`, so on
macOS there is no sudo password to type.

```sh
npm run build:macos-helper        # -> native/macos-wifi-helper/build/WiFiHeatmapperHelper.app
H=native/macos-wifi-helper/build/WiFiHeatmapperHelper.app/Contents/MacOS/WiFiHeatmapperHelper
$H info        # the joined network: rssi, noise, channel, band, width, tx rate, PHY mode, security, SSID, BSSID
$H scan        # nearby networks (fresh scan, ~5 s); `scan --cached` returns the last scan instantly
$H status      # Location permission only
$H authorize   # show the macOS Location prompt and wait for the answer (--timeout 60)
```

Needs the Xcode command line tools (`xcode-select --install`). The build is a
universal binary (arm64 + x86_64, macOS 11+), ad-hoc signed by default
(`codesign -s -`); releases sign it with a certificate, see "Signing". On
other platforms the npm script prints a message and exits 0.

## Why an app bundle

CoreWLAN gives RSSI, noise, channel, band, channel width, tx rate, PHY mode
and security to any process, without root. Since macOS 14.4 it returns the
SSID and BSSID (and the SSIDs in scan results) as `nil` unless the calling
process has **Location** permission. `wdutil` prints `<redacted>` for the same
reason, and `system_profiler` too.

Location permission is granted per app bundle, so the helper is a bundle with
`NSLocationWhenInUseUsageDescription` / `NSLocationUsageDescription` in its
`Info.plist`. Same idea as the open-source "wifi-unredactor".

## JSON

Every command prints one JSON object on stdout. Missing values are `null`
(not `0`). The server-side parser is `src/lib/macos-helper-parse.ts`, with
fixtures in `__tests__/data/mac-helper-*.json`.

```json
{
  "helperVersion": 1,
  "bundleId": "io.github.hnykda.wifi-heatmapper.helper",
  "locationAuthorized": false,
  "locationStatus": "notDetermined",          // notDetermined | denied | restricted | authorized
  "locationServicesEnabled": true,            // the global switch in System Settings
  "responsibilityDisclaimed": true,
  "interface": {
    "name": "en0", "powerOn": true, "associated": true,
    "ssid": null, "bssid": null,              // strings once Location is allowed
    "rssi": -59, "noise": -78,                // dBm
    "channel": 44, "band": 5, "channelWidth": 80,   // band in GHz (2.4/5/6), width in MHz
    "txRate": 864, "phyMode": "802.11ax", "security": "WPA2 Personal",
    "countryCode": null
  },
  "networks": [ /* scan only: same fields minus txRate/phyMode, plus beaconInterval */ ]
}
```

On failure: `{"error": "..."}` and a non-zero exit (1 = CoreWLAN failed,
2 = usage). A 30 s watchdog (authorize: timeout + 10 s) guarantees the helper
never hangs its caller.

## How it must be invoked (TCC / Location attribution)

Findings from this Mac (macOS 27.0.1, Darwin 27.0.0, Apple silicon, Xcode 27
SDK, Swift 6.4), October 2026. Evidence is `log show --predicate 'process ==
"locationd"' --info --debug`.

1. **Running `Contents/MacOS/WiFiHeatmapperHelper` directly works.** No
   `open` needed. locationd identifies the client by the bundle that contains
   the executable, not by the parent (Terminal, node, the Tauri shell):

   ```
   #registration UUID mapping  clientName: "<uuid>:io.github.hnykda.wifi-heatmapper.helper"  pid: 72179
   ```

   That line is for a run with `--no-disclaim`, i.e. a plain child of the
   shell. A run through `node` (the dev server, `execFile`) registers the same
   way. This differs from TCC-proper permissions (camera, files, ...), which
   are charged to the *responsible* process (usually the terminal app).

2. **Responsibility disclaim, as a belt-and-braces measure.** By default the
   helper re-executes itself with the private
   `responsibility_spawnattrs_setdisclaim(attr, 1)` (looked up with `dlsym`,
   skipped if absent), so it is its own responsible process, like an app
   launched from Finder. stdout/stderr are inherited, signals are forwarded,
   the exit code is passed through. Cost: ~5 ms. Turn it off with
   `--no-disclaim` or `WIFI_HEATMAPPER_HELPER_NO_DISCLAIM=1`. Location
   attribution was identical with and without it (point 1), and so are the
   unredacted SSIDs once allowed (see "Verified after "Allow"").

3. **`open -W -n -g --stdout <file> WiFiHeatmapperHelper.app --args info`
   also works** (same JSON, same attribution) but needs a temp file for stdout
   and goes through LaunchServices. Not needed.

4. **The prompt appears for an ad-hoc signed bundle**, from any directory,
   even one locationd cannot read. `authorize` from the shell (and from the
   server) made locationd log `Showing #AuthPrompt ... RequestType
   AuthorizationRequestTypeLegacyAlways` and CoreLocationAgent showed:

   > **"WiFi Heatmapper Helper" would like to use your current location.**
   > WiFi Heatmapper reads the name (SSID) and access point (BSSID) of your
   > Wi-Fi network for the survey. macOS only shares them with apps that have
   > Location access. Your location itself is not used.
   > [Don't Allow] [Allow]

   The dialog can open on another display and stays there until answered,
   even after the helper exits. Answering it needs a human: there is no API
   to grant Location, and synthetic clicks are ignored by design.

5. Harmless noise in the logs: locationd (running as `_locationd`) cannot read
   a bundle inside a `drwxr-x---` home folder (`Unable to create bundle at
   URL ... (13)`, `get_verified_requirement: failed ... 100013`), and
   LaunchServices has no record for a bundle that was never opened in Finder
   (`lsregister -f` does not change that). Neither stopped the prompt or the
   registration under the bundle id. An app in `/Applications` will not hit
   the first one.

6. Speed: `info` ~90 ms, `status` ~250 ms, `scan --cached` ~110 ms, `scan`
   (fresh) ~5-7 s. The server uses `info` per reading and `scan --cached`
   for the network list, so it never triggers a fresh scan mid-measurement.

### Verified after "Allow" (macOS 27, 2026-10-04)

- `info` returns the SSID and BSSID, and `scan --cached` names the networks,
  once two things hold:
  1. The process has checked in as an app (`NSApplication.shared`). Reads
     before that call come back nil even with Location allowed; reads after it
     are unredacted. A throwaway probe app showed this read by read.
  2. The authorization callback has delivered the granted state. The first
     callback can still say "not determined"; `settle()` waits for the
     second.
  Both hold with and without `--no-disclaim`, and with `open`.
- The permission does **not** survive a rebuild. An ad-hoc signature is
  identified by its cdhash, which changes with every build, so each new build
  asks again. For the desktop app that means one prompt per update unless the
  helper is signed with a stable identity (a self-signed certificate kept in
  CI secrets is enough: the designated requirement then names the
  certificate, not the hash). The desktop app does that, see "Signing".

To reset and try again: System Settings > Privacy & Security > Location
Services, remove "WiFi Heatmapper Helper", or `tccutil` does *not* cover
Location (it lives in `/var/db/locationd/clients.plist`, root only).

## Where the server looks for it

`src/lib/server-paths.ts` `getMacosHelperCandidates()`, first match wins:

1. `$WIFI_HEATMAPPER_MACOS_HELPER` (an `.app` or the executable itself)
2. `$WIFI_HEATMAPPER_RESOURCES_DIR/helpers/WiFiHeatmapperHelper.app` (the desktop app sets this)
3. `native/macos-wifi-helper/build/WiFiHeatmapperHelper.app` relative to the server's cwd

If none is found, or it fails, the server falls back to `sudo wdutil info`
and asks for the password as before.

## In the desktop app

`desktop/build-server.mjs` runs `build.mjs <server>/helpers` on macOS, so the
app ships `Contents/Resources/server/helpers/WiFiHeatmapperHelper.app` and
the server finds it through `WIFI_HEATMAPPER_RESOURCES_DIR` (candidate 2
above). It stays a separate nested `.app` with its own bundle id rather than
moving the usage string into the Tauri app's Info.plist: locationd charges the
bundle that contains the executable, and the helper is that executable. The
prompt therefore names "WiFi Heatmapper Helper".

Checked with Tauri 2.12 (`npm run desktop:build`, October 2026):

- Tauri copies the bundle unchanged: exec bit, `_CodeSignature/`, same
  cdhash. (It has no symlinks.)
- Tauri signs `Contents/MacOS/wifi-heatmapper` and then the outer `.app`
  (ad-hoc, `signingIdentity: "-"`), without `--deep`, so the helper keeps its
  own signature. The outer signature seals the helper's files as resources.
  `codesign --verify --deep --strict` passes on the `.app` and on the copy
  inside the mounted `.dmg`. CI checks this after every macOS build
  (`release.yml`, "Check the Wi-Fi helper's signature").
- Gatekeeper is unchanged by the nested, self-signed helper. A quarantined
  copy dragged out of the `.dmg`: `spctl --assess` says `rejected` for the
  app, exactly like the build without a helper, and `rejected,
  origin=WiFi Heatmapper Helper Signing` for the helper. Opening it shows the
  usual "Apple could not verify "WiFi Heatmapper.app" is free of malware"
  (Done / Move to Trash, no "damaged"); after "Open Anyway" the app runs
  (from an App Translocation path) and the server runs the quarantined
  helper with no further dialog.
- In the packaged app, `POST /api/macos-helper {"action":"authorize"}` (the
  Settings tab's "Allow Location access") showed the prompt for "WiFi
  Heatmapper Helper"; after "Allow", readings had the SSID and BSSID and
  `server.log` showed the helper path, no `wdutil`, no sudo.

## Signing

Location permission is stored against the bundle's *designated requirement*.
For an ad-hoc signature that is `cdhash H"..."`, new on every build, so every
rebuild (every app update) asks again. Signed with a certificate it is

```
designated => identifier "io.github.hnykda.wifi-heatmapper.helper" and certificate root = H"b7eaa8f6d4ac6199ccafbe3b813bbd7e030bfb13"
```

which stays the same as long as the certificate does. A self-signed
certificate is enough: nothing here needs trust, only stability. Verified on
macOS 27: build A signed with it, "Allow" once; build B with a different
binary (new cdhash, CFBundleVersion 2) signed with the same certificate,
installed over A: `status` said `authorized`, `info` returned the SSID, no
prompt.

The project's certificate: CN "WiFi Heatmapper Helper Signing", self-signed,
code signing only, valid until 2036, SHA-1
`B7EAA8F6D4AC6199CCAFBE3B813BBD7E030BFB13`. It lives in the repository's
Actions secrets `MACOS_HELPER_CERT_P12` (base64 of the `.p12`) and
`MACOS_HELPER_CERT_PASSWORD`, and with the maintainer. **Do not replace it
lightly**: a new certificate means every user is asked once more. Before it
expires (2036), make a new one well ahead and accept one prompt per user.

`build.sh` reads:

| Variable | Meaning |
|---|---|
| `MACOS_HELPER_SIGN_IDENTITY` | codesign identity (common name or SHA-1). Unset: `-`, ad-hoc. |
| `MACOS_HELPER_SIGN_KEYCHAIN` | keychain that holds it (optional) |

Without them (forks, contributors, fork PRs in CI) the helper is ad-hoc
signed and works the same, only the Location permission does not survive
rebuilds. A release run (`v*` tag or manual dispatch) refuses to build
without the certificate; a pull request just warns.

`signing-keychain.sh` puts the `.p12` in a throwaway keychain (random
password, added to the search list, partition list set so codesign never
shows a dialog) and prints the identity; CI uses it. Locally, with the
maintainer's copy:

```sh
KC=$TMPDIR/helper-signing.keychain-db
export MACOS_HELPER_CERT_PASSWORD=$(cat ~/.config/wifi-heatmapper/helper-signing/password.txt)
export MACOS_HELPER_SIGN_IDENTITY=$(native/macos-wifi-helper/signing-keychain.sh \
  create "$KC" ~/.config/wifi-heatmapper/helper-signing/helper-signing.p12)
export MACOS_HELPER_SIGN_KEYCHAIN=$KC
npm run desktop:build            # or npm run build:macos-helper
native/macos-wifi-helper/signing-keychain.sh delete "$KC"
```

The outer app stays ad-hoc (Tauri). If it is ever signed for real (Developer
ID), sign inside-out: the helper first (its own identity, or the same
Developer ID), then the outer app without `--deep`, which would re-sign the
helper with the outer identity and change its designated requirement.
