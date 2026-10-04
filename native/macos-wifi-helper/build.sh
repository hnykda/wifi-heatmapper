#!/bin/sh
# Builds WiFiHeatmapperHelper.app (universal arm64 + x86_64, ad-hoc signed).
#
#   native/macos-wifi-helper/build.sh [output-dir]
#
# Default output: native/macos-wifi-helper/build/WiFiHeatmapperHelper.app
# Needs the Xcode command line tools (swiftc, lipo, codesign).
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
OUT_DIR=${1:-"$HERE/build"}
APP="$OUT_DIR/WiFiHeatmapperHelper.app"
BIN=WiFiHeatmapperHelper
MIN_MACOS=11.0

if [ "$(uname -s)" != "Darwin" ]; then
  echo "build:macos-helper: skipped (the helper is only used on macOS)"
  exit 0
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo "build:macos-helper: swiftc not found. Install the tools with: xcode-select --install" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for ARCH in arm64 x86_64; do
  swiftc -O \
    -target "$ARCH-apple-macos$MIN_MACOS" \
    -framework CoreWLAN -framework CoreLocation -framework AppKit \
    -o "$TMP/$BIN-$ARCH" \
    "$HERE/Sources/main.swift"
done

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
lipo -create -output "$APP/Contents/MacOS/$BIN" "$TMP/$BIN-arm64" "$TMP/$BIN-x86_64"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# Ad-hoc signature: required to run on Apple silicon, and it seals
# Info.plist so macOS can tie the Location permission to this bundle.
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --strict "$APP"

echo "Built $APP ($(lipo -archs "$APP/Contents/MacOS/$BIN"))"
