---
title: Using it with an AI agent (MCP)
description: Let Claude or another AI agent read your surveys, guide you through measuring one while you carry the laptop, and explain the results, through an optional MCP server.
order: 8
---

# Using wifi-heatmapper with an AI agent (MCP)

wifi-heatmapper comes with an optional [MCP](https://modelcontextprotocol.io)
server. With it, an AI agent such as Claude Code or Claude Desktop can read
your surveys, explain them, help you set up a new one, and guide you through
measuring it while you carry the laptop.

## What an agent can and can't do

**It can:**

- **read** your floor plans and surveys: every point's position, signal (%
  and dBm), noise and signal-to-noise ratio where measured, network, access
  point and speed results;
- **analyse** them: dead zones, weak rooms, which access point covers which
  rooms, and whether slow speed comes from weak signal or something else;
- **plan** a survey: how many spots, how far apart, where to fill gaps;
- **set up** a survey: signal only or signal and speed, the speed test
  server, test duration, extra iperf3 options, access point names and the
  heat map look;
- **copy settings** from one survey to another, for example to set up the
  second floor like the first;
- **name points** ("Kitchen", "Desk upstairs"), so it and you can talk
  about rooms instead of point ids;
- **measure with you carrying the laptop**: it tells you where to go, waits
  until you say you're there, measures, and tells you the result in plain
  words (see [Taking measurements](#taking-measurements));
- **report a problem**: it prepares the same redacted report as the app's
  **Report a problem** button and gives you a GitHub link to open yourself.

**It can't:**

- **walk around.** You carry the laptop; the agent asks before every
  measurement.
- **see the heat map images.** The app draws them in your browser, so the
  agent gets a numeric grid computed the same way instead.
- **handle the sudo password.** No tool takes or returns it. Where one is
  needed you type it in the app's Settings (see
  [The sudo password](#the-sudo-password)); never paste it into the chat.
- **work when the app isn't running.** It talks to the running app; start
  the app first.
- **delete anything** or change floor plans or measured values. A
  measurement only adds a point, and `update_point` only changes a point's
  name.

## How it fits together

The MCP server is a small program your AI client starts on your computer.
It talks to the running app over the app's own local HTTP API, the same one
the browser uses, and never reads or writes the app's files directly.

```
AI agent  --stdio-->  MCP server  --HTTP, this computer only-->  wifi-heatmapper app
```

## Setup

Three steps: start the app, find the two paths below, and add them to your
AI client. The MCP server needs Node.js 20 or newer; the desktop app brings
its own.

### 1. Find the paths

**From source.** Build the MCP server once, and again after you update the
app, then start the app:

```bash
cd wifi-heatmapper
npm run mcp:build      # writes dist/mcp/wifi-heatmapper-mcp.mjs
npm run dev            # in another terminal: the app on http://localhost:3000
```

The command is `node`, the argument is the absolute path of
`dist/mcp/wifi-heatmapper-mcp.mjs` (one file, no dependencies), and the app
is at `http://localhost:3000`. If the app runs on another port, set
`WIFI_HEATMAPPER_URL`, for example `http://localhost:3100`.

**Desktop app.** It ships the MCP server and the Node.js to run it:

| System | Command (Node) | Argument (MCP server) |
| --- | --- | --- |
| macOS | `/Applications/WiFi Heatmapper.app/Contents/Resources/server/node` | `/Applications/WiFi Heatmapper.app/Contents/Resources/server/mcp-server.mjs` |
| Windows (setup `.exe`) | `%LOCALAPPDATA%\WiFi Heatmapper\server\node.exe` | `%LOCALAPPDATA%\WiFi Heatmapper\server\mcp-server.mjs` |
| Windows (`.msi`) | `C:\Program Files\WiFi Heatmapper\server\node.exe` | `C:\Program Files\WiFi Heatmapper\server\mcp-server.mjs` |
| Linux (`.deb`) | `/usr/lib/WiFi Heatmapper/server/node` | `/usr/lib/WiFi Heatmapper/server/mcp-server.mjs` |

The AppImage mounts itself at a different path on every start, so there is
no stable path to point an agent at. Use the `.deb` or run from source.

**The desktop app's port.** The desktop app picks a free port each time it
starts, so the agent can't know it. Give the app a fixed port with the
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

### 2. Add it to your client

#### Claude Code

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

On Windows or Linux, use the two paths from the table the same way. Add
`-s user` to make it available in every project. Check it with
`claude mcp list`, or `/mcp` inside Claude Code.

#### Claude Desktop

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

Desktop app on macOS:

```json
{
  "mcpServers": {
    "wifi-heatmapper": {
      "command": "/Applications/WiFi Heatmapper.app/Contents/Resources/server/node",
      "args": ["/Applications/WiFi Heatmapper.app/Contents/Resources/server/mcp-server.mjs"],
      "env": { "WIFI_HEATMAPPER_URL": "http://127.0.0.1:3917" }
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

Claude Desktop does not expand `~` or `%LOCALAPPDATA%`, so write paths out
in full. If `node` is not found, give its full path (`which node`).

#### Any other MCP client

It is a standard stdio server:

- **command:** `node`, or the desktop app's bundled Node from the table;
- **arguments:** the path to `wifi-heatmapper-mcp.mjs` (from source) or
  `mcp-server.mjs` (desktop app);
- **environment:** `WIFI_HEATMAPPER_URL`, if the app is not on
  `http://localhost:3000`.

`node wifi-heatmapper-mcp.mjs --help` prints the options and exits.
`npm run --silent mcp` builds and starts it in one go; keep `--silent`,
because npm's own output on stdout would break the protocol.

### 3. Try it

Ask "List my wifi-heatmapper surveys". The agent should call
`list_surveys` and name your floor plans. If it can't reach the app, see
[Troubleshooting](#troubleshooting).

## An example

```
You:    Let's measure the ground floor. I have the laptop.
Agent:  (check_setup, get_survey "Ground floor.png": 1100 x 700 px, 3 points,
        all in the living room; get_heatmap_grid shows nothing measured in
        the east half.)
        Speed tests are on (server 192.168.1.10). Let's fill the east half
        first: 6 spots, about 3 m apart. First, the kitchen: on the plan
        that's the room top right, around (900, 150). Go there, hold the
        laptop where you'd use it, and tell me when you're there.
You:    I'm by the kitchen counter.
Agent:  (start_measurement {"survey":"Ground floor.png","x":900,"y":150};
        your client asks you to allow it. Then wait_for_measurement.)
        Kitchen: signal 48% (-74 dBm) from "Hall AP", 5 GHz; download
        180 Mbps, upload 95 Mbps. Weak but usable. Next: the hallway by
        the front door, around (700, 400). Tell me when you're there.
You:    There.
Agent:  (start_measurement, wait_for_measurement)
        Hallway: 22% (-86 dBm), saved without speed: the speed test server
        did not answer. That's a dead zone. Next: the study, around
        (1000, 550).
You:    Stop, someone needs the laptop.
Agent:  (cancel_measurement if one is running.) Stopped; nothing more was
        saved. You have 5 points; when you're back, we'll do the study and
        the bathroom, and then I can explain the map (analyse_survey).
```

You can also just ask, for example "Which rooms have weak Wi-Fi in my
Home.png survey, and where should I put a second access point?"

## Taking measurements

The agent can measure, but it can't walk: you carry the laptop. A
measurement is the same one you get by clicking the floor plan in the app,
started by the agent at a position it names in floor-plan pixels.

1. The agent proposes a spot ("the kitchen, by the window") and you go
   there with the laptop, holding it where you'd use it. You can also pick
   the spots yourself.
2. You say you're there. Your MCP client asks you to allow
   `start_measurement` (keep that on).
3. The app measures, exactly as for a click: signal, and speed if the
   survey has speed tests on. Keep the laptop still.
4. The server saves the point. The agent reads it back with
   `wait_for_measurement` and tells you the result in plain words, then
   moves on.

**Watch the map fill in as you go.** Keep the app open on that floor plan
in a browser tab (on the Floor plan tab). It shows each measurement the
agent starts live, with the same progress panel as your own clicks, and
the new point when it's saved. Nothing to set up: every open tab follows
the measurement the server is running.

### You stay in control

- **You confirm every measurement.** `start_measurement` and
  `cancel_measurement` are marked as tools that change something
  (`readOnlyHint: false`), so MCP clients ask before running them. The
  agent is also told to wait for you to say you're at the spot. A
  measurement runs commands on this computer (the Wi-Fi tools, iperf3), the
  same ones a click runs, with the survey's settings.
- **One at a time.** The app runs one measurement at a time. While one
  runs, `start_measurement` is refused with the running job's id, and a
  click in the app waits too.
- **Cancel any time.** Say stop, or press Cancel in the app's progress
  panel. `cancel_measurement` only stops the job it names, kills a running
  iperf3 at once and saves nothing. A measurement that is already being
  saved can't be stopped.
- A measurement only adds a point. It never changes or deletes others; you
  can switch a point off or delete it in the app. The agent can name a
  point (`update_point`), nothing else.

### The measurement tools

`start_measurement(survey, x, y)`: `x` and `y` are floor-plan pixels
(origin top left), checked against the floor plan's size (a spot off the
plan is refused). It sends the survey's own speed settings, never a
password, and waits a few seconds for the first step (can Wi-Fi be read,
is a sudo password needed) so a problem there is reported at once.
Otherwise it returns the job id:

```
> start_measurement {"survey":"Home.png","x":400,"y":250}
{"jobId":"sMOPDKsyE6","survey":"Home.png","x":400,"y":250,"state":"running",
 "speedTest":"on","next":"Call wait_for_measurement with this jobId. ..."}
```

`wait_for_measurement(jobId, timeoutSeconds)` waits up to `timeoutSeconds`
(default 45, at most 300; `0` only checks) and returns the saved point
described the way `get_survey` describes points, with a one-line summary:

```
> wait_for_measurement {"jobId":"sMOPDKsyE6"}
{"jobId":"sMOPDKsyE6","state":"done","pointId":"Point_1",
 "summary":"Signal 81% (-51 dBm) from Demo Network, channel 44 (5 GHz); download 650.86 Mbps, upload 488.99 Mbps.",
 "point":{"id":"Point_1","x":400,"y":250,"signalPercent":81,"rssiDbm":-51, ...}}
```

If the speed test was skipped (iperf3 missing, server unreachable), the
point is still saved and the answer says `"savedWithoutSpeed": "Saved
without speed: <reason>"`. If the measurement failed, it says why
(`"state": "error", "reason": ...`) and nothing was saved. If it is still
running when the time is up, it answers `"state": "running"` with the
current step, and the agent calls it again. Many clients give up on a tool
call after 60 seconds, hence the default of 45.

`cancel_measurement(jobId)` stops that job. If it had already finished,
the answer says so (and which point was saved).

`update_point(survey, pointId, label)` names a point, for example right
after a measurement, with the name you use for the spot:

```
> update_point {"survey":"Home.png","pointId":"Point_1","label":"Kitchen"}
{"survey":"Home.png","pointId":"Point_1","label":"Kitchen",
 "note":"Saved. An open app tab shows the new name."}
```

The label is trimmed and at most 60 characters; `""` removes it. Only the
name changes: the id (`Point_1`) and the measured values stay as they
were. The app shows the label instead of the id, `get_survey` returns it
as `label`, and the agent uses it when it talks about the point.

### The sudo password

On most computers no password is needed and measuring just works:

| System | Password? |
| --- | --- |
| macOS with the Wi-Fi helper (the desktop app, or `npm run build:macos-helper`) | No |
| macOS without the helper (`wdutil`) | Yes |
| Linux, when `iw` reads the connection as a normal user (most desktops) | No |
| Linux, when `iw` is refused | Yes |
| Windows | No |
| Docker | No (the container runs as root) |
| Mock mode | No |

Where one is needed, the agent can't ask you for it and you shouldn't give
it in chat: no tool takes it. Instead, the measurement stops at its first
step and the agent tells you:

> This computer needs the sudo password to read Wi-Fi. Enter it once in
> the app's Settings (it stays in memory), then try again.

Type it in the app's Settings tab. The app's server then holds it **in
memory only, for as long as the app runs**: it is never written to a file
or a log, never returned by any API (`GET /api/sudo-password` only says
whether one is held), and gone when the app restarts. It is only ever given
to `sudo` on its standard input, for the app's own Wi-Fi commands
(`wdutil info`, `iw dev <interface> link`). Measurements you start by
clicking use it too, so after a page reload you don't have to type it
again. Emptying the field forgets it. If the password is wrong, the agent
says so and you correct it in Settings.

`check_setup` says whether the app holds one (`sudoPasswordHeld`), and on
macOS whether the Wi-Fi helper makes it unnecessary.

## Tools

Survey names are floor plan file names, as `list_surveys` returns them
(for example `EmptyFloorPlan.png`). Positions are in floor-plan image
pixels, with the origin at the top left. Throughput is in Mbps.

| Tool | What it does |
| --- | --- |
| `list_surveys` | Floor plans, and for each survey its point count, whether throughput tests are on, and when it was last saved. A survey file that cannot be read is listed with `unreadable: true`. |
| `get_survey(name)` | All points and a summary. Optional thresholds: `weakSignalPercent` (default 50, about -70 dBm), `deadSignalPercent` (25, about -85 dBm), `slowDownloadMbps` (25). `includePoints: false` returns the summary only. |
| `get_settings(name)` | The settings `update_settings` can change. |
| `update_settings(name, ...)` | Change some of them and save the survey. |
| `copy_settings(from, to, parts?)` | Copy settings from one survey to another and save it. |
| `check_setup(name?)` | What the app can tell without measuring, plus problems and notes. |
| `get_heatmap_grid(name, metric, cells)` | A numeric heat map. |
| `report_problem(name?, problem?, includeNetwork?)` | A bug report for the developers and a prefilled GitHub issue link. Posts nothing. |
| `start_measurement(survey, x, y)` | Measure at that spot (you are holding the laptop there) and save a point. Returns a job id. |
| `wait_for_measurement(jobId, timeoutSeconds?)` | Wait for it and return the saved point, or why it failed. |
| `cancel_measurement(jobId)` | Stop it at once. Nothing is saved. |
| `update_point(survey, pointId, label)` | Name a point (`""` removes the name). Changes nothing else. |

### get_survey

Each point looks like this (shortened):

```json
{
  "id": "Point_7", "label": "Office", "x": 922, "y": 92, "enabled": true,
  "measuredAt": "2026-10-28T08:20:26.571Z",
  "ssid": "Demo Network", "bssid": "9e05d696e830", "apName": null,
  "signalPercent": 29, "rssiDbm": -83, "noiseDbm": -92, "snrDb": 9,
  "channel": 44, "bandGHz": 5,
  "tcpDownload": { "mbps": 75.69, "retransmits": 0 },
  "tcpUpload": { "mbps": 58.87, "retransmits": 0 },
  "udpDownload": null, "udpUpload": null
}
```

`label` is the name given to the point in the app or with `update_point`,
or `null`. `noiseDbm` and `snrDb` are `null` where the system reports no noise
(Windows, some Linux drivers). A test is `null` when it did not run (signal
only, no iperf3 server, or it failed); a test that ran and got nothing
through is `{ "mbps": 0 }`, a dead spot. `channel`, `bandGHz`,
`channelWidthMHz` and `txRateMbps` are `null` where the system did not
report them. UDP
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
| `measureSpeed` | `true` measures signal and speed (iperf3), `false` signal only |
| `iperfServerAdrs` | the speed test server, `"192.168.1.10"` or `"nas.local:5201"`. Set without `measureSpeed`, `"localhost"` also turns speed off and any other server turns it on, as before |
| `testDuration` | seconds per iperf3 test, 1 to 60 |
| `iperfCommands` | extra iperf3 options for any of `tcpDownload`, `tcpUpload`, `udpDownload`, `udpUpload`, one argument per item, e.g. `{ "udpUpload": ["-b", "500M"] }`; the others are kept |
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

The agent can set what you can set in the app's Settings tab. No command
runs through a shell, so the server and the iperf3 options reach iperf3 as
separate arguments, never as a command. The server must be a host name, an
IPv4 or IPv6 address, with an optional port (`nas.local:5201`,
`[fe80::1]:5201`), and options the app sets itself (`-c`, `-p`, `-t`, `-R`,
`-u`, `-J`) are refused. If anything is refused, nothing is saved.

The app saves each change on its own (one setting, one point), so a change
the agent makes while the app is open on that floor plan is kept. The page
shows it after its next save, or when you reload it.

### copy_settings

Copies settings from the survey `from` into the survey `to`, as
**Copy settings from…** does in the app. `parts` is a list of:

| Part | What is copied |
| --- | --- |
| `speed` (the default) | signal only or signal and speed, the iperf3 server, test duration and extra iperf3 options |
| `apNames` | access point names |
| `heatmapLook` | heat spot radius, opacity, blur, colour gradient and fixed colour scales |

Points, the floor plan, its size and the sudo password are never copied. If
`to` has no survey yet, it is created. The answer says which settings
changed.

```
> copy_settings {"from":"Ground floor.png","to":"First floor.png","parts":["speed","apNames"]}
{"copied":["speed","apNames"],"created":false,"changed":["iperfServerAdrs","apMapping"], ...}
```

### check_setup

Reports the app version and OS, mock mode, whether iperf3 is installed, the
macOS Wi-Fi helper and its Location access, whether the app holds a sudo
password (`sudoPasswordHeld`, yes or no, never the password), and, with a
survey name, whether throughput tests are set up. `problems` lists what will
stop a measurement from working well; `notes` lists the rest.

Some things can't be checked without measuring: whether the iperf3 server
answers, whether Wi-Fi can be read, and, on Linux, whether a sudo password
is needed. The app checks them as the first step of a measurement, and
`start_measurement` reports what it finds within a few seconds.

### report_problem

The same report as **Report a problem** in the app (see the
[FAQ](faq.md#something-went-wrong-how-do-i-report-it)): app version, OS,
how the app runs and reads Wi-Fi, iperf3, the last measurement and the
recent log. The sudo password is always removed; network names, MAC and IP
addresses are replaced by placeholders unless `includeNetwork` is true. It
returns the summary and an `issueUrl` for you to open, check and submit.
When the report is too long for a link, it also returns `fullDiagnostics`
to paste into the issue.

Agents are told to suggest it when they see something that looks like a bug
rather than a Wi-Fi problem: an error, impossible readings (0% or -100 dBm
everywhere, channel 0), no noise readings on macOS, or Windows saying it
can't read Wi-Fi through the WLAN API.

## Prompts

Prompts are ready-made requests your MCP client offers (in Claude Code, type
`/` and look for `wifi-heatmapper`).

| Prompt | Arguments | What it asks for |
| --- | --- | --- |
| `analyse_survey` | `name` | Dead zones, weak areas, which access point serves where, throughput bottlenecks compared with signal, concrete suggestions (move or add an access point), and what the data can't show. |
| `compare_surveys` | `before`, `after` | A before and after comparison with the same metrics, cell by cell when the floor plans match, and fixed colour scales for side-by-side maps. |
| `plan_survey` | `name` (optional) | How many points and how far apart, where to stand, and how to set up the iperf3 server. |
| `survey_walkthrough` | `name`, `rooms` (optional) | The agent guides you spot by spot while you carry the laptop: it plans the spots (filling gaps and weak areas from `get_heatmap_grid`), asks you to go to each, waits for you to confirm, measures and tells you the result. |

## Safety model

- **This computer only.** The MCP server refuses any app address other than
  `localhost`, `127.0.0.1` or `::1`. The app runs commands on the machine it
  runs on (iperf3, and `sudo` on some systems), with the settings it is
  given, so it should never be driven over the network. If you really need
  to, set `WIFI_HEATMAPPER_MCP_ALLOW_REMOTE=1`, and make sure nothing else
  can reach that port.
- **No secrets.** The sudo password is never returned and can't be set
  through MCP. The app never saves it, its settings API strips it from
  anything it reads or writes, and the copy the app's server holds for
  agent-started measurements stays in memory (see
  [The sudo password](#the-sudo-password)).
- **Changes are real.** `update_settings` saves the survey file, and the next
  measurement uses the new settings. `start_measurement` runs the Wi-Fi
  tools and iperf3 on this computer and adds a point; `update_point`
  renames one. Nothing can delete anything or change measured values. Most clients ask before calling a
  tool that changes something; keep that on.
- **Sends nothing.** The MCP server talks only to the app on this computer.
  It has no [usage counts](privacy.md) of its own and no tool that reads or
  changes the app's.
- **Other web sites can't use it.** The app refuses API requests that come
  from another web site open in your browser, or that are addressed to a
  name other than a local one. Tools on this computer, such as the MCP
  server, are allowed.
- The app's HTTP API has no login, like the rest of the app. Anything on
  this computer that can reach the port can use it, with or without MCP.

## Troubleshooting

**"Can't reach wifi-heatmapper at http://localhost:3000. Is the app running?"**
Start the app (`npm run dev`, or open the desktop app). If it runs on
another port, set `WIFI_HEATMAPPER_URL`. For the desktop app, see
[the desktop app's port](#1-find-the-paths).

**"Refusing to talk to ..."** `WIFI_HEATMAPPER_URL` points at another
computer. See [Safety model](#safety-model).

**"Unexpected answer ... not JSON"** Something else is listening on that
port. Check the URL in your browser: it should show wifi-heatmapper.

**"No survey for ..."** Use a name from `list_surveys`. A floor plan gets a
survey file once it has been opened in the app.

**"This computer needs the sudo password to read Wi-Fi."** Type the
password in the app's Settings tab (it stays in memory until the app
quits), then ask the agent to try again. On macOS, the Wi-Fi helper makes
it unnecessary. Don't paste it into the chat.

**"A measurement is already running."** Only one runs at a time: wait for
it (`wait_for_measurement`), or cancel it in the app or with
`cancel_measurement`.

**"The app doesn't know measurement ..."** The app keeps the last 20 jobs
and forgets them when it restarts. Check the survey with `get_survey`.

**The open tab doesn't show the agent's measurement.** It follows
measurements for the floor plan it shows: open the same floor plan.

**The open tab doesn't show the agent's settings change.** The change is
saved; the page picks it up after its next save of that survey, or when you
reload it. Each change is saved on its own, so the page never undoes it.

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
  `measure.ts` the measurement helpers, `prompts.ts` the prompts,
  `app-client.ts` the HTTP client). Measurements use the app's job API
  (`POST /api/start-task?action=start|stop`, `GET ...?action=status&id=`);
  the sudo password the Settings tab gives the server is in
  `src/lib/sudo-session.ts` and `/api/sudo-password`. The heat map
  grid is the pure `src/lib/heatmap-grid.ts`, which mirrors
  `src/app/webGL/shaders/heatmapFragmentShader.ts` and `Heatmaps.tsx`; keep
  them in step.
- `npm run mcp:build` bundles it with esbuild (`scripts/build-mcp.mjs`).
  The MCP SDK is a devDependency used only by that bundle, never by the
  Next.js app. `desktop/build-server.mjs` writes the same bundle to
  `desktop/server/mcp-server.mjs`, and `desktop/smoke-test.mjs` checks it.
- Tests: `__tests__/heatmap-grid.test.ts`, `__tests__/mcp-*.test.ts`,
  `__tests__/sudo-session.test.ts`. `mcp-server.test.ts` builds the bundle
  and drives it with the SDK's client against a fake app (measuring
  included: start, wait, cancel, one at a time, the sudo message).
  `e2e/two-writers.spec.ts` checks that an open tab follows a measurement
  started over the API.
- Possible follow-ups: let the desktop app write its URL somewhere the MCP
  server can find it, or prefer a fixed port, so `WIFI_HEATMAPPER_PORT` isn't
  needed; have the page pick up a survey that changed on the server without
  waiting for its next save.
