# wifi-heatmapper

Next.js 15 (app router, React 19, Tailwind 3, shadcn/Radix) desktop-style web
app that measures Wi-Fi signal + iperf3 throughput on the machine it runs on
and draws heat maps on a floor plan. Runs on macOS, Windows, Linux (+Docker).

## Commands

- `npm run dev:mock` - run with synthetic measurements (no sudo, no iperf3). Use this for UI work.
- `npm run verify` - lint + typecheck + unit tests. Must pass before a commit.
- `npm run e2e` - Playwright against a mock-mode server on :3100 (data in `.e2e-data/`).
- `npm run build` - production build; catches server/client boundary mistakes `dev` hides.

## Layout

- `src/lib/wifiScanner-{macos,windows,linux,mock}.ts` implement `WifiActions` (types.ts). `wifiScanner.ts` picks one; `WIFI_HEATMAPPER_MOCK=1` selects the mock.
- `src/lib/iperfRunner.ts` is the measurement sequence and pushes progress via `server-globals.ts` (SSE).
- `src/lib/server-paths.ts` is the only place that knows where data lives (`data/surveys`, `data/media`; overridable with `WIFI_HEATMAPPER_DATA_DIR`).
- `src/instrumentation.ts` -> `server-init.ts` runs once at server start (seeds bundled floor plans from `assets/floorplans`, migrates pre-0.5 uploads from `public/media`).
- `src/components/GlobalSettings.tsx` owns all client state for the current survey and debounces writes to `/api/settings`. Mutate through `updateSettings` / `surveyPointActions` only.
- `src/components/layout/AppShell.tsx` is the header + tabs; the active tab is in the URL hash.
- Floor plan images are served by `/api/media/[name]`, never from `/public`, so `next start` works.

## Conventions

- Parsers of command output are pure functions with fixtures in `__tests__/data`; add a fixture + test for every new OS/locale case.
- `sudoerPassword` lives only in memory; the settings API strips it before writing.
- Route handlers export only HTTP methods and `dynamic`; put constants elsewhere (Next's type check rejects other exports).
- UI copy: sentence case, plain verbs, no jargon. Tokens live in `globals.css`; use `brand` for interactive accents, never raw colors. The heat map gradient is the only loud color.
- `data-testid` attributes are the e2e contract; keep them when refactoring.
- Do not add Google Fonts or other network-loaded assets: the app must work offline.
