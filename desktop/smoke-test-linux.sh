#!/usr/bin/env bash
# Starts the built Linux app (the real Tauri shell, not just the server) on a
# virtual display in mock mode and checks it serves the UI, then that stopping
# it leaves no node process behind.
#
#   desktop/smoke-test-linux.sh path/to/WiFi.Heatmapper.AppImage
#   desktop/smoke-test-linux.sh /usr/bin/wifi-heatmapper        (installed .deb)
#
# Needs Xvfb and curl. An AppImage runs with APPIMAGE_EXTRACT_AND_RUN=1, so no
# FUSE is needed (CI runners and containers have none).
# Run by .github/workflows/release.yml on the Linux rows.
set -euo pipefail

app=$(realpath "$1")
work=$(mktemp -d)
data="$work/data"
log="$work/app.log"
port=$(shuf -i 20000-60000 -n 1)
base="http://127.0.0.1:$port"

display=:$((90 + RANDOM % 100))
Xvfb "$display" -screen 0 1280x900x24 >/dev/null 2>&1 &
xvfb=$!

app_pid=
cleanup() {
  [ -n "$app_pid" ] && kill -9 "$app_pid" 2>/dev/null || true
  kill "$xvfb" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  echo "FAIL $*"
  echo "--- app output"
  cat "$log" || true
  exit 1
}

DISPLAY=$display \
  APPIMAGE_EXTRACT_AND_RUN=1 \
  WIFI_HEATMAPPER_MOCK=1 \
  WIFI_HEATMAPPER_PORT=$port \
  WIFI_HEATMAPPER_DATA_DIR=$data \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  "$app" >"$log" 2>&1 &
app_pid=$!

for _ in $(seq 1 120); do
  kill -0 "$app_pid" 2>/dev/null || fail "the app exited early"
  curl -fsS "$base/api/status" >/dev/null 2>&1 && break
  sleep 0.5
done
status=$(curl -fsS "$base/api/status") || fail "server did not answer within 60 s"
echo "ok   server answers on $base"

echo "$status" | grep -q '"mockMode":true' || fail "not in mock mode: $status"
echo "$status" | grep -q "\"dataDir\":\"$data\"" || fail "wrong data dir: $status"
echo "ok   /api/status: mock mode, data in $data"

curl -fsS "$base/" | grep -q "/_next/static/" || fail "/ has no /_next/static assets"
echo "ok   /"

curl -fsS "$base/api/media" | grep -q EmptyFloorPlan.png || fail "floor plans not seeded"
[ -f "$data/media/EmptyFloorPlan.png" ] || fail "floor plan not on disk"
echo "ok   bundled floor plans seeded"

# The bundled node processes (AppImage: the extracted copy; .deb:
# /usr/lib/WiFi Heatmapper/server/node). Found by executable, because Next
# renames its process ("next-server").
server_pids() {
  for exe in /proc/[0-9]*/exe; do
    case "$(readlink "$exe" 2>/dev/null)" in
      */server/node) basename "$(dirname "$exe")" ;;
    esac
  done
}
node_pids=$(server_pids)
[ -n "$node_pids" ] || fail "no bundled node process"
shell_pids=$(pgrep -x wifi-heatmapper || true)
[ -n "$shell_pids" ] || fail "no wifi-heatmapper process"
for pid in $node_pids; do
  echo "     server: $(readlink "/proc/$pid/exe")"
done

# Inside an AppImage the shell's environment points GTK/GIO at the bundle; the
# server (and nmcli, iw, iperf3 under it) must not inherit that.
appdir=$(tr '\0' '\n' <"/proc/${shell_pids%% *}/environ" | sed -n 's/^APPDIR=//p')
if [ -n "$appdir" ]; then
  for pid in $node_pids; do
    leaked=$(tr '\0' '\n' <"/proc/$pid/environ" | grep -F "$appdir" |
      grep -Ev '^(APPDIR|APPIMAGE|ARGV0|OWD|WIFI_HEATMAPPER_RESOURCES_DIR)=' || true)
    [ -z "$leaked" ] || fail "server inherited AppImage paths: $leaked"
  done
  shell_vars=$(tr '\0' '\n' <"/proc/${shell_pids%% *}/environ" | grep -F "$appdir" | cut -d= -f1 | tr '\n' ' ')
  echo "ok   server environment has no AppImage paths (the shell's: $shell_vars)"
fi

# A plain SIGTERM ends the shell without its exit handler; the server must
# notice its stdin closing and exit on its own. Signal the shell itself: with
# an AppImage, $app_pid is the AppImage runtime, which only waits for it.
kill $shell_pids
wait "$app_pid" 2>/dev/null || true
app_pid=
for _ in $(seq 1 40); do
  [ -z "$(server_pids)" ] && break
  sleep 0.25
done
if [ -n "$(server_pids)" ]; then
  ps -fp "$(server_pids | tr '\n' ',' | sed 's/,$//')" || true
  fail "node still running 10 s after the app was stopped"
fi
echo "ok   no node process left after the app stopped"
echo "linux app smoke test passed"
