---
title: Using it with an AI agent (MCP)
description: Let Claude or another AI agent read your surveys, help plan one and explain the results, through an optional MCP server.
order: 8
---

# Using wifi-heatmapper with an AI agent (MCP)

wifi-heatmapper comes with an optional [MCP](https://modelcontextprotocol.io)
server. With it, an AI agent such as Claude Code or Claude Desktop can read
your surveys, help you set up a survey, and explain the results: where the
dead zones are, which access point covers which rooms, and whether slow
throughput comes from weak signal or from something else.

It is a small program the agent starts on your computer. It talks to the
running app over the app's own local HTTP API, the same one the browser
uses. It never reads or writes the app's files directly.

```
AI agent  --stdio-->  MCP server  --HTTP, this computer only-->  wifi-heatmapper app
```

## What an agent can and cannot do

**It can:**

- list your floor plans and surveys;
- read every point of a survey: position, signal strength (% and dBm),
  network name and BSSID, access point name, iperf3 results, and whether the
  point is switched on;
- summarise a survey: min, median and max of each metric, dead-zone, weak
  and slow points, and which access points were seen at how many points;
- get a coarse numeric heat map (a grid of numbers) of any metric;
- check what it can of your setup: is iperf3 installed, is the macOS Wi-Fi
  helper there and allowed Location access, are throughput tests set up;
- change a short list of settings: iperf3 server, test duration, iperf3
  commands, access point names, heat spot radius, opacity and fixed colour
  scales.

**It cannot:**

- **Take measurements.** Measuring through the agent is planned as step
  two; for now you click the floor plan in the app. Even then, it can't walk
  around: someone has to carry the laptop to each spot.
- **See the heat map images.** The app draws them in your browser with
  WebGL, so there is no image on the server to hand over. The agent gets a
  numeric grid computed the same way instead.
- **Handle the sudo password.** It is never sent to the agent and can't be
  set by it. Type it in the app's Settings tab as usual.
- **Work when the app isn't running.** Start the app first.
- **Change anything else**, such as survey points, floor plans or the
  colour gradient, or delete anything.

## Setup

You need the app running, and Node.js 20 or newer to run the MCP server
(the desktop app brings its own).

### From source

Build the MCP server once (and again after you update the app):

```bash
cd wifi-heatmapper
npm run mcp:build      # writes dist/mcp/wifi-heatmapper-mcp.mjs
npm run dev            # in another terminal: the app on http://localhost:3000
```

The server is `dist/mcp/wifi-heatmapper-mcp.mjs`, a single file with no
dependencies. Use its absolute path below. `npm run --silent mcp` builds and
starts it in one go; keep `--silent`, because npm's own output on stdout would
break the protocol.

If the app runs on another port, set `WIFI_HEATMAPPER_URL`, for example
`http://localhost:3100`.

### Desktop app

The desktop app ships the MCP server and the Node.js to run it:

| System | Node | MCP server |
| --- | --- | --- |
| macOS | `/Applications/WiFi Heatmapper.app/Contents/Resources/server/node` | `/Applications/WiFi Heatmapper.app/Contents/Resources/server/mcp-server.mjs` |
| Windows (setup `.exe`) | `%LOCALAPPDATA%\WiFi Heatmapper\server\node.exe` | `%LOCALAPPDATA%\WiFi Heatmapper\server\mcp-server.mjs` |
| Windows (`.msi`) | `C:\Program Files\WiFi Heatmapper\server\node.exe` | `C:\Program Files\WiFi Heatmapper\server\mcp-server.mjs` |
| Linux (`.deb`) | `/usr/lib/WiFi Heatmapper/server/node` | `/usr/lib/WiFi Heatmapper/server/mcp-server.mjs` |

The AppImage mounts itself at a different path on every start, so there is
no stable path to point an agent at. Use the `.deb` or run from source.

**The port.** The desktop app picks a free port each time it starts, so the
agent can't know it. Give the app a fixed port with the
`WIFI_HEATMAPPER_PORT` environment variable, and use the same port in
`WIFI_HEATMAPPER_URL`. The examples use 3917:

- **macOS:** start the app from Terminal with
  `WIFI_HEATMAPPER_PORT=3917 "/Applications/WiFi Heatmapper.app/Contents/MacOS/wifi-heatmapper"`,
  or run `launchctl setenv WIFI_HEATMAPPER_PORT 3917` once (it lasts until you
  log out) and then open the app as usual.
- **Windows:** run `setx WIFI_HEATMAPPER_PORT 3917` once, then start the app
  from the Start menu.
- **Linux:** `WIFI_HEATMAPPER_PORT=3917 wifi-heatmapper`.

Use `http://127.0.0.1:3917` as the URL: the desktop app listens on 127.0.0.1
only.

### Claude Code

From source:

```bash
claude mcp add wifi-heatmapper \
  -e WIFI_HEATMAPPER_URL=http://localhost:3000 \
  -- node /path/to/wifi-heatmapper/dist/mcp/wifi-heatmapper-mcp.mjs
```

Desktop app on macOS:

```bash
claude mcp add wifi-heatmapper \
  -e WIFI_HEATMAPPER_URL=http://127.0.0.1:3917 \
  -- "/Applications/WiFi Heatmapper.app/Contents/Resources/server/node" \
     "/Applications/WiFi Heatmapper.app/Contents/Resources/server/mcp-server.mjs"
```

Add `-s user` to make it available in every project. Check it with
`claude mcp list`, or `/mcp` inside Claude Code.

### Claude Desktop

Edit `claude_desktop_config.json` (Settings, Developer, Edit config; on
macOS it is in `~/Library/Application Support/Claude/`, on Windows in
`%APPDATA%\Claude\`) and restart Claude Desktop.

From source:

```json
{
  "mcpServers": {
    "wifi-heatmapper": {
      "command": "node",
      "args": ["/path/to/wifi-heatmapper/dist/mcp/wifi-heatmapper-mcp.mjs"],
      "env": { "WIFI_HEATMAPPER_URL": "http://localhost:3000" }
    }
  }
}
```

Desktop app on Windows (setup `.exe`; replace `you` with your user name):

```json
{
  "mcpServers": {
    "wifi-heatmapper": {
      "command": "C:\\Users\\you\\AppData\\Local\\WiFi Heatmapper\\server\\node.exe",
      "args": ["C:\\Users\\you\\AppData\\Local\\WiFi Heatmapper\\server\\mcp-server.mjs"],
      "env": { "WIFI_HEATMAPPER_URL": "http://127.0.0.1:3917" }
    }
  }
}
```

On macOS, use the two paths from the table above in `command` and `args`.
Claude Desktop does not expand `~` or `%LOCALAPPDATA%`, so write paths out
in full. If `node` is not found, give its full path (`which node`).

### Any other MCP client

It is a standard stdio server:

- **command:** `node` (or the desktop app's bundled node)
- **arguments:** the path to `wifi-heatmapper-mcp.mjs` (or `mcp-server.mjs`)
- **environment:** `WIFI_HEATMAPPER_URL`, if the app is not on
  `http://localhost:3000`

`node wifi-heatmapper-mcp.mjs --help` prints the options and exits.

## Tools

Survey names are floor plan file names, as `list_surveys` returns them
(for example `EmptyFloorPlan.png`). Positions are in floor-plan image
pixels, with the origin at the top left. Throughput is in Mbps.

| Tool | What it does |
| --- | --- |
| `list_surveys` | Floor plans, and for each survey its point count, whether throughput tests are on, and when it was last saved. |
| `get_survey(name)` | All points and a summary. Optional thresholds: `weakSignalPercent` (default 50, about -70 dBm), `deadSignalPercent` (25, about -85 dBm), `slowDownloadMbps` (25). `includePoints: false` returns the summary only. |
| `get_settings(name)` | The settings `update_settings` can change. |
| `update_settings(name, ...)` | Change some of them and save the survey. |
| `check_setup(name?)` | What the app can tell without measuring, plus problems and notes. |
| `get_heatmap_grid(name, metric, cells)` | A numeric heat map. |

### get_survey

Each point looks like this (shortened):

```json
{
  "id": "Point_7", "x": 922, "y": 92, "enabled": true,
  "measuredAt": "2026-10-28T08:20:26.571Z",
  "ssid": "Demo Network", "bssid": "9e05d696e830", "apName": null,
  "signalPercent": 29, "rssiDbm": -83, "channel": 44, "bandGHz": 5,
  "tcpDownload": { "mbps": 75.69, "retransmits": 0 },
  "tcpUpload": { "mbps": 58.87, "retransmits": 0 },
  "udpDownload": null, "udpUpload": null
}
```

A test is `null` when it did not run (no iperf3 server, or it failed). UDP
results have `mbps`, `jitterMs`, `lostPackets` and `packetsReceived`.

The summary only uses points that are switched on, like the heat maps:

```json
"summary": {
  "points": 25, "enabledPoints": 25, "throughputMeasuredPoints": 25,
  "metrics": {
    "signalPercent": { "count": 25, "min": 20, "median": 63, "max": 93, "unit": "%" },
    "tcpDownloadMbps": { "count": 25, "min": 36, "median": 357.2, "max": 778.4, "unit": "Mbps" }
  },
  "deadZonePointIds": ["Point_25"],
  "weakSignalPointIds": ["Point_7", "Point_13", "Point_18", "Point_19", "Point_23", "Point_24"],
  "accessPoints": [
    { "bssid": "9e05d696e830", "apName": null, "ssid": "Demo Network", "bandGHz": 5,
      "channels": [44], "points": 25, "medianSignalPercent": 63 }
  ]
}
```

### get_heatmap_grid

`metric` is one of the maps on the Heat maps tab: `signalStrength`, `snr`
(signal-to-noise ratio in dB; only points with a noise reading, which macOS
and some Linux drivers give and Windows doesn't), `tcpDownload-bitsPerSecond`, `tcpDownload-retransmits`,
`tcpUpload-bitsPerSecond`, and for `udpDownload` and `udpUpload` each of
`-bitsPerSecond`, `-jitterMs`, `-lostPackets`, `-packetsReceived`.
`cells` (2 to 60, default 20) is the number of cells along the longer side.

The grid is computed the way the app draws the map: inverse-distance
weighting with power 3, from the points that are switched on, using the
same radius as the Heat maps tab (yours, or the automatic one). A cell is
`null` where no point is close enough, which is blank on the map. Values
are in the map's units and are not clamped; the colour scale is returned
separately.

```
> get_heatmap_grid {"name":"EmptyFloorPlan.png","metric":"signalStrength","cells":8}
{"unit":"%","pointsUsed":25,"radius":{"pixels":156,"automatic":true},
 "floorPlan":{"width":1024,"height":763},
 "colourScale":{"min":0,"max":100,"fixed":false},
 "columns":8,"rows":6,
 "x":[64,192,320,448,576,704,832,960], "y":[64,191,318,445,572,699],
 "values":[[71,76.9,83.7,81.8,63.2,51.7,42.2,29], ...]}
```

`values[row][column]` is the value at (`x[column]`, `y[row]`).

### update_settings

Only the fields you give change. The rest of the survey, including all
points, is kept as it is.

| Field | Value |
| --- | --- |
| `iperfServerAdrs` | `"192.168.1.10"`, `"nas.local:5201"`, or `"localhost"` to turn throughput tests off |
| `testDuration` | seconds per iperf3 test, 1 to 60 |
| `iperfCommands` | any of `tcpDownload`, `tcpUpload`, `udpDownload`, `udpUpload`; the others are kept |
| `apMapping` | the whole list of `{ "apName", "macAddress" }`; a MAC address may end in `*` to match every BSSID that starts with it |
| `radiusDivider` | heat spot radius in floor-plan pixels, or `null` for automatic |
| `maxOpacity`, `minOpacity` | 0 to 1 |
| `heatmapRanges` | fixed colour scales per map, for example `{ "tcpDownload-bitsPerSecond": { "min": 0, "max": 600, "enabled": true } }`; `null` removes one, others are kept |

Example:

```
> update_settings {"name":"EmptyFloorPlan.png","testDuration":2,
    "heatmapRanges":{"tcpDownload-bitsPerSecond":{"min":0,"max":600,"enabled":true}}}
{"saved":true,"changed":["testDuration","heatmapRanges"], ...}
```

The iperf3 server and commands end up in a shell command when you measure,
so the agent may only set plain values: a host name or IPv4 address with an
optional port, and commands that start with `iperf3`, contain `{server}` and
`-J`, and have no quotes, pipes, redirects or other shell syntax. Anything
else is refused and nothing is saved. You can still type other commands in
the app's Settings tab yourself.

**If the app is open on that floor plan, reload the page after a change.**
The page keeps its own copy of the survey and writes all of it back on your
next change, which would undo the agent's edit.

### check_setup

Reports the app version and OS, mock mode, whether iperf3 is installed, the
macOS Wi-Fi helper and its Location access, and, with a survey name, whether
throughput tests are set up. `problems` lists what will stop a measurement
from working well; `notes` lists the rest.

Some things can't be checked without measuring: whether the iperf3 server
answers, whether Wi-Fi can be read, and whether a sudo password is needed.
The app only checks them when a measurement starts, so the agent will ask
you to take one measurement in the app.

## Prompts

Prompts are ready-made requests your MCP client offers (in Claude Code, type
`/` and look for `wifi-heatmapper`).

| Prompt | Arguments | What it asks for |
| --- | --- | --- |
| `analyse_survey` | `name` | Dead zones, weak areas, which access point serves where, throughput bottlenecks compared with signal, concrete suggestions (move or add an access point), and what the data can't show. |
| `compare_surveys` | `before`, `after` | A before and after comparison with the same metrics, cell by cell when the floor plans match, and fixed colour scales for side-by-side maps. |
| `plan_survey` | `name` (optional) | How many points and how far apart, where to stand, and how to set up the iperf3 server. |

You can also just ask, for example "Which rooms have weak Wi-Fi in my
Home.png survey, and where should I put a second access point?"

## Security

- **This computer only.** The MCP server refuses any app address other than
  `localhost`, `127.0.0.1` or `::1`. The app runs commands on the machine it
  runs on (iperf3, and `sudo` on some systems), with the settings it is
  given, so it should never be driven over the network. If you really need
  to, set `WIFI_HEATMAPPER_MCP_ALLOW_REMOTE=1`, and make sure nothing else
  can reach that port.
- **No secrets.** The sudo password is never returned and can't be set. The
  app never saves it, and its settings API strips it from anything it
  reads or writes.
- **Changes are real.** `update_settings` saves the survey file, and the next
  measurement uses the new settings. It can't delete anything, touch the
  survey points, or run a measurement. Most clients ask before calling a
  tool that changes something; keep that on.
- The app's HTTP API has no login, like the rest of the app. Anything on
  this computer that can reach the port can use it, with or without MCP.

## Troubleshooting

**"Can't reach wifi-heatmapper at http://localhost:3000. Is the app running?"**
Start the app (`npm run dev`, or open the desktop app). If it runs on
another port, set `WIFI_HEATMAPPER_URL`. For the desktop app, see "The
port" above.

**"Refusing to talk to ..."** `WIFI_HEATMAPPER_URL` points at another
computer. See Security.

**"Unexpected answer ... not JSON"** Something else is listening on that
port. Check the URL in your browser: it should show wifi-heatmapper.

**"No survey for ..."** Use a name from `list_surveys`. A floor plan gets a
survey file once it has been opened in the app.

**The agent's settings change disappeared.** The app was open on that floor
plan and saved its own copy. Reload the page, then make the change again.

**The grid is all `null`, or has few numbers.** The survey has few points
or a small radius. Each point only reaches as far as the radius (shown in
the result); add points or set a larger `radiusDivider`.

**The server doesn't show up in the client.** Run the command from your
config by hand, for example
`node /path/to/dist/mcp/wifi-heatmapper-mcp.mjs --help`. If that fails,
fix the path or install Node.js 20+. Clients start it with a minimal
environment, so use absolute paths. With `npm run mcp`, add `--silent`.

**Mock mode.** `npm run dev:mock` works too; `check_setup` says the
measurements are synthetic.

## For developers

- Code: `src/mcp/` (`main.ts` is the entry point, `server.ts` the tools,
  `prompts.ts` the prompts, `app-client.ts` the HTTP client). The heat map
  grid is the pure `src/lib/heatmap-grid.ts`, which mirrors
  `src/app/webGL/shaders/heatmapFragmentShader.ts` and `Heatmaps.tsx`; keep
  them in step.
- `npm run mcp:build` bundles it with esbuild (`scripts/build-mcp.mjs`).
  The MCP SDK is a devDependency used only by that bundle, never by the
  Next.js app. `desktop/build-server.mjs` writes the same bundle to
  `desktop/server/mcp-server.mjs`, and `desktop/smoke-test.mjs` checks it.
- Tests: `__tests__/heatmap-grid.test.ts`, `__tests__/mcp-*.test.ts`. The
  last one builds the bundle and drives it with the SDK's client against a
  fake app.
- **Step two (planned): measuring.** A tool that starts a measurement
  (`POST /api/start-task?action=start`), follows its progress, and adds the
  point at a given position. Open questions: the app adds points from the
  browser today, so an agent adding one at the same time needs a server-side
  way to append a point; and it needs a clear confirmation, because a
  measurement runs commands on this computer.
- Possible follow-ups: let the desktop app write its URL somewhere the MCP
  server can find it, or prefer a fixed port, so `WIFI_HEATMAPPER_PORT` isn't
  needed; have the page reload a survey that changed on disk.
