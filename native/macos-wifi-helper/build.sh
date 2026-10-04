#!/bin/sh
# Builds WiFiHeatmapperHelper.app (universal arm64 + x86_64) and signs it.
#
#   native/macos-wifi-helper/build.sh [output-dir]
#
# Default output: native/macos-wifi-helper/build/WiFiHeatmapperHelper.app
# Needs the Xcode command line tools (swiftc, lipo, codesign).
#
# Signing (README.md, "Signing"):
#   MACOS_HELPER_SIGN_IDENTITY  codesign identity (name or SHA-1). Default "-",
#                               ad-hoc: fine for development, but macOS forgets
#                               the Location permission on every rebuild.
#   MACOS_HELPER_SIGN_KEYCHAIN  keychain that holds it (optional)
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

# A signature is required to run on Apple silicon, and it seals Info.plist so
# macOS can tie the Location permission to this bundle. The permission follows
# the designated requirement: for an ad-hoc signature that is the cdhash (new
# on every build), for a certificate it is "this identifier, this certificate",
# which stays the same across builds and releases.
IDENTITY=${MACOS_HELPER_SIGN_IDENTITY:-}
[ -n "$IDENTITY" ] || IDENTITY=-
set -- --force --sign "$IDENTITY" --timestamp=none
if [ -n "${MACOS_HELPER_SIGN_KEYCHAIN:-}" ]; then
  set -- "$@" --keychain "$MACOS_HELPER_SIGN_KEYCHAIN"
fi
codesign "$@" "$APP"
codesign --verify --strict "$APP"

if [ "$IDENTITY" = - ]; then
  SIGNED="ad-hoc signature"
else
  SIGNED=$(codesign -dvv "$APP" 2>&1 | sed -n 's/^Authority=//p' | head -n 1)
  SIGNED="signed by ${SIGNED:-$IDENTITY}"
fi
echo "Built $APP ($(lipo -archs "$APP/Contents/MacOS/$BIN"), $SIGNED)"
