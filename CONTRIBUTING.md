# Contributing to wifi-heatmapper

Thanks for helping. Issues and pull requests are reviewed regularly.
First-time contributor? Look for the
[good first issue](https://github.com/hnykda/wifi-heatmapper/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22)
label.

## Set up

```bash
git clone https://github.com/hnykda/wifi-heatmapper.git
cd wifi-heatmapper
npm install
npm run dev:mock     # http://localhost:3000, synthetic measurements
```

`dev:mock` runs the app with `WIFI_HEATMAPPER_MOCK=1`: Wi-Fi and iperf3
results are made up, so you can click around on any machine without a sudo
password, an iperf3 server, or even a Wi-Fi card. Use `npm run dev` for real
measurements.

Node 20 or newer is required (CI runs on 22).

## Everyday commands

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Real measurements on this machine                         |
| `npm run dev:mock`   | Synthetic measurements, works everywhere                  |
| `npm run verify`     | Lint, type check and unit tests (what CI runs first)      |
| `npm run e2e`        | Playwright end-to-end tests against a mock-mode server    |
| `npm run e2e:ui`     | The same tests with Playwright's UI for debugging         |
| `npm run lint`       | ESLint with auto-fix (Prettier runs through ESLint)       |
| `npm run test:watch` | Vitest in watch mode                                      |
| `npm run build`      | Production build (`npm start` serves it)                  |

The first `npm run e2e` needs a browser: `npx playwright install chromium`.

Set `LOG_LEVEL=2` (debug) or `LOG_LEVEL=1` (trace) to see every command the
server runs and its output. Bug reports should include that log.

## Where things are

```
src/app/                Next.js app router: layout, page, API routes
  api/status            what is running (version, OS, mock mode, iperf3)
  api/media             floor plan images: list, upload, serve, delete
  api/settings          survey files: read, write, list, delete
  api/start-task        start/stop/poll a measurement
  api/events            server-sent progress events during a measurement
  webGL/                heat map renderer (inverse-distance weighting)
src/components/         React UI. layout/ has the shell; ui/ is shadcn/Radix
src/lib/                shared code
  wifiScanner-*.ts      one file per OS + wifiScanner-mock.ts; picked by wifiScanner.ts
  iperfRunner.ts        the measurement sequence (wifi, TCP, wifi, UDP, wifi)
  server-paths.ts       where data lives on disk
  types.ts              every shared type
src/instrumentation.ts  runs once when the server starts (seeds floor plans, migrates old data)
__tests__/              Vitest unit tests + fixtures of real command output
e2e/                    Playwright tests
assets/floorplans/      floor plans bundled with the app
data/localization/      label tables for localized `netsh` output (Windows)
docs/                   user docs, theory of operation, FAQ
```

User data lives in `data/` (`surveys/*.json`, `media/*`). Set
`WIFI_HEATMAPPER_DATA_DIR` to put it elsewhere; the e2e tests use `.e2e-data/`.

## How a measurement works

1. The browser POSTs the measurement settings to `/api/start-task?action=start`
   and opens `/api/events` for progress.
2. The server runs `runSurveyTests()` in `iperfRunner.ts`: preflight checks,
   then Wi-Fi, TCP tests, Wi-Fi, UDP tests, Wi-Fi. Signal strength is the
   average of the three readings.
3. The browser polls `/api/start-task?action=results` until the state is
   `done` or `error`, then adds the point to the survey, which is saved to
   `data/surveys/<floor plan>.json`.

Platform code implements the `WifiActions` interface in `types.ts`. Parsers
for command output are pure functions with fixtures under `__tests__/data`;
when you add support for a new OS version or language, add a fixture and a
test rather than a mock.

## Pull requests

- Keep a PR to one topic. Open an issue first for larger changes.
- Run `npm run verify` and `npm run e2e` before pushing; CI runs both.
- Every PR needs evidence it works: automated tests where possible,
  otherwise a screenshot or a short note about what you tried on which OS.
  The PR template asks for this. It is also how we filter out untested,
  auto-generated PRs.
- Add a line to `CHANGELOG.md` under the unreleased version.
- If you change something users see, update `docs/User_Interface.md`.

## Windows localization

`netsh wlan` prints localized labels. `data/localization/*.json` maps them to
internal names. To add a language, copy `en-us-win11.json`, translate the
keys (not the values), and add fixtures of your `netsh` output to
`__tests__/data/` with a test in `__tests__/parsing/`. See issue #26.

## Releasing

1. Bump `version` in `package.json` and finish the `CHANGELOG.md` entry.
2. `npm run verify && npm run build && CI=1 npm run e2e`.
3. Tag `vX.Y.Z` and create a GitHub release with the changelog section.
