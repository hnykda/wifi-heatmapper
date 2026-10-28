---
title: Privacy and usage counts
description: The anonymous usage counts the app sends, every field in them, what is never sent, and all the ways to turn them off.
order: 9
---

# Privacy and usage counts

I build wifi-heatmapper on my own, and I only keep working on it if people
actually use it. Anonymous counts of installs, app starts and measurements
tell me that, and honestly keep me motivated. Nothing identifies you, and
you can turn it off any time.

Your surveys, floor plans and results stay on your computer. The only
thing the app sends on its own is the small usage counts described here.
They are on by default, and the app tells you so the first time it runs,
with **Turn off** right next to it.

## What is sent

Three events, sent by the app's server (never by the browser page):

| Event | When |
| --- | --- |
| `Install` | once, the first time the app runs with usage counts on |
| `App start` | when the app starts, at most once a day |
| `Measurement` | each time a measurement point is saved |

Each event carries these properties, and nothing else:

| Property | Values |
| --- | --- |
| `version` | the app version, e.g. `0.7.0` |
| `os` | `macos`, `windows`, `linux` or `other` |
| `arch` | the processor type, e.g. `arm64` or `x64` |
| `runs_as` | `desktop` (the desktop app), `docker`, `podman` or `browser` (from source, opened in a browser) |
| `mode` | `Measurement` only: `signal` (signal only) or `speed` (signal and speed) |
| `speed_ok` | `Measurement` only: `yes` (speed measured), `no` (saved without speed) or `skipped` (signal only) |

This is a whole `Measurement` event, exactly as sent:

```text
POST https://plan.danielhnyk.cz/api/event
User-Agent: wifi-heatmapper/0.7.0 (<random install id>)
Content-Type: application/json

{
  "name": "Measurement",
  "url": "app://wifi-heatmapper/measurement",
  "domain": "app.wifi-heatmapper.danielalder.cz",
  "props": {
    "version": "0.7.0",
    "os": "macos",
    "arch": "arm64",
    "runs_as": "desktop",
    "mode": "speed",
    "speed_ok": "yes"
  }
}
```

`Install` and `App start` look the same, without `mode` and `speed_ok`.
**Settings > Usage counts** in the app shows the event your computer would
send, built by the same code that sends it, and when the last one went out.

## What is never sent

- network names (SSIDs) and access point addresses (BSSIDs, MAC addresses);
- IP addresses of anything you entered, such as the speed test server;
- host names, user names, file names, folder paths and floor plans;
- any measured value: signal strength, dBm, channels, speeds;
- error messages and logs;
- the sudo password.

The event is built from the fixed fields above only. Nothing from a survey
reaches it, and the tests check that with surveys full of real-looking
network names and addresses.

## Where it goes

To my own [Plausible Analytics](https://plausible.io) server at
`plan.danielhnyk.cz` (Plausible Community Edition, self-hosted), not to a
third-party analytics service.

Plausible counts unique visitors from the IP address and the User-Agent
header, mixed with a random salt that changes every day. It stores neither:
**no IP address is stored**, and the daily hash can't be traced back or
linked from one day to the next.

The User-Agent the app sends is `wifi-heatmapper/<version> (<install id>)`.
The install id is a random UUID made on your computer the first time usage
counts are on. It is not derived from anything about you or your computer,
it is only ever in that header, and it is not stored by Plausible. All it
does is make one install count as one visitor a day. It is not in bug
reports either: they only say whether usage counts are on.

The id is kept in `usage-counts.json` in the app's data folder (see
[Where is my data?](faq.md#where-is-my-data)), next to the on/off setting.
Turning usage counts off in Settings deletes it.

The request goes straight from your computer to that server, with a short
timeout, in the background. Offline, it is dropped silently: the app works
the same with or without it.

## How to turn it off

Any one of these:

- **In the app:** Settings > Usage counts > turn off **Send anonymous usage
  counts**, or **Turn off** on the first-run notice. It is saved for this
  computer (not in your surveys), and the install id is deleted.
- **With an environment variable:** start the app with
  `WIFI_HEATMAPPER_TELEMETRY=0` (`false` or `off` work too). For example
  `WIFI_HEATMAPPER_TELEMETRY=0 npm start`, or
  `docker run -e WIFI_HEATMAPPER_TELEMETRY=0 ...`.
- **With `DO_NOT_TRACK=1`**, the [common convention](https://consoledonottrack.com)
  for command-line tools.

It is also always off, and Settings says why, when:

- the app runs in mock mode (`WIFI_HEATMAPPER_MOCK`, `npm run dev:mock`),
  which includes the end-to-end tests;
- you run the development server (`npm run dev`), unless you set
  `WIFI_HEATMAPPER_TELEMETRY=1`;
- `CI` is set (automated builds and tests).

When it is off, nothing is sent and no install id is made.

In Docker, keep the data folder on a volume (`-v ./datas:/app/data`, as in
[Running from source](run-from-source.md#docker-linux-hosts-only)), or each
new container counts as a new install.

## For developers

`WIFI_HEATMAPPER_TELEMETRY_URL` sends the events to another Plausible server
(the base URL, or its `/api/event`), and `WIFI_HEATMAPPER_TELEMETRY_DOMAIN`
sets the site name. The code is in `src/lib/telemetry.ts`.

The [MCP server](mcp.md) sends nothing: it only talks to the app on your
computer.
