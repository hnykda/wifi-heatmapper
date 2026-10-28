# wifi-heatmapper

Next.js 16 (app router, React 19, Tailwind 4, shadcn/Radix) desktop-style web
app that measures Wi-Fi signal + iperf3 throughput on the machine it runs on
and draws heat maps on a floor plan. Runs on macOS, Windows, Linux (+Docker).

## Commands

- `npm run dev:mock` - run with synthetic measurements (no sudo, no iperf3). Use this for UI work.
- `npm run verify` - lint + typecheck + unit tests. Must pass before a commit.
- `npm run e2e` - Playwright against a mock-mode server on :3100 (data in `.e2e-data/`).
- `npm run build` - production build; catches server/client boundary mistakes `dev` hides.
- Next.js 16 differs from older training data: check `node_modules/next/dist/docs/` (see AGENTS.md). With a dev server running, the `next-devtools` MCP server in `.mcp.json` reports its compile errors, routes and logs.

## Layout

- `src/lib/wifiScanner-{macos,windows,linux,mock}.ts` implement `WifiActions` (types.ts). `wifiScanner.ts` picks one; `WIFI_HEATMAPPER_MOCK=1` selects the mock.
- A measurement is a server-side job (`src/lib/measurement-job.ts`, `POST /api/start-task`): one at a time, cancel aborts its commands, the server saves the point. `src/lib/iperfRunner.ts` is the sequence it runs; progress goes to every open tab over SSE (`/api/events`). Commands never use a shell (`execAsync(file, args)` in `server-utils.ts`).
- `src/lib/server-paths.ts` is the only place that knows where data lives (`data/surveys`, `data/media`; overridable with `WIFI_HEATMAPPER_DATA_DIR`).
- `src/instrumentation.ts` -> `server-init.ts` runs once at server start (seeds bundled floor plans from `assets/floorplans`, migrates pre-0.5 uploads from `public/media`).
- The server owns survey files: `src/lib/survey-store.ts` is the only writer (per-file lock, atomic writes), and `src/lib/schema.ts` (Zod) validates files on load (lenient) and API bodies (strict). Endpoints send small operations: `PATCH /api/settings`, `/api/surveys/[name]/points`.
- `src/components/GlobalSettings.tsx` holds the client's view of the current survey and sends those operations in order. Mutate through `updateSettings` / `surveyPointActions` only.
- `src/components/layout/AppShell.tsx` is the header + tabs; the active tab is in the URL hash.
- Floor plan images are served by `/api/media/[name]`, never from `/public`, so `next start` works.
- `src/proxy.ts` (Next 16's name for middleware) refuses cross-site `/api` requests via `src/lib/request-guard.ts`.
- `src/mcp/` is the optional MCP server for AI agents (`npm run mcp:build`, bundled with esbuild): a stdio client of the app's own HTTP API, never its files. User docs: `docs/guide/mcp.md`.
- The standalone builds (Docker, `desktop/build-server.mjs`) use `next build --webpack`: Turbopack symlinks the external `koffi` package in a way the packaging can't ship. Dev and `npm run build` use Turbopack.
- `docs/guide/*.md` is the user guide and the single source for the website: `site/build.mjs` renders it to wifi-heatmapper.danielalder.cz/docs/<slug> (GitHub Pages, `.github/workflows/site.yml`) and generates `llms.txt` / `llms-full.txt` from it. Developer docs are in `docs/dev/`. See `site/README.md`.

## Conventions

- Parsers of command output are pure functions with fixtures in `__tests__/data`; add a fixture + test for every new OS/locale case.
- `sudoerPassword` is never written and never returned: the server holds it in memory for the session (`src/lib/sudo-session.ts`, `PUT /api/sudo-password`), and the settings API strips it from anything it reads or writes.
- Route handlers export only HTTP methods and `dynamic`; put constants elsewhere (Next's type check rejects other exports).
- UI copy: sentence case, plain verbs, no jargon. Tokens live in `globals.css`; use `brand` for interactive accents, never raw colors. The heat map gradient is the only loud color.
- `data-testid` attributes are the e2e contract; keep them when refactoring.
- e2e specs import `test`/`expect` from `e2e/fixtures.ts`: each test starts from fresh data, and `mock.set({...})` (scenarios in `src/lib/mock-scenario.ts`) makes the mock fail on purpose. Don't fake API answers with `page.route()` when a scenario can do it.
- The React Compiler is on and the build fails if it skips a component: no `useMemo`/`useCallback` for speed, `useEffectEvent` for effect-only reads, no `try`/`finally` inside components (see CONTRIBUTING.md).
- A user-visible change updates the matching `docs/guide/` page in the same PR. Link between guide pages with relative `.md` links; the site build rewrites them.
- Do not add Google Fonts or other network-loaded assets: the app must work offline.
