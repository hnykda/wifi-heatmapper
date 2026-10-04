#!/bin/sh
# Puts the helper's signing certificate in a throwaway keychain, so build.sh
# can sign with it without touching the login keychain.
#
#   signing-keychain.sh create <keychain> <cert.p12>   (password in $MACOS_HELPER_CERT_PASSWORD)
#   signing-keychain.sh delete <keychain>
#
# `create` adds the keychain to the user's search list (codesign only finds
# identities there) and prints the certificate's SHA-1, which works as the
# signing identity:
#
#   MACOS_HELPER_SIGN_IDENTITY=<sha1> MACOS_HELPER_SIGN_KEYCHAIN=<keychain> npm run desktop:build
#
# `delete` removes it from the search list again and deletes it. CI runs both
# (.github/workflows/release.yml); see README.md, "Signing".
set -eu

usage() {
  echo "usage: $0 create <keychain> <cert.p12> | delete <keychain>" >&2
  exit 2
}

[ $# -ge 2 ] || usage
ACTION=$1
KEYCHAIN=$2
case "$KEYCHAIN" in
  /*) ;;
  *) KEYCHAIN="$(pwd)/$KEYCHAIN" ;;
esac

search_list() {
  security list-keychains -d user | sed -e 's/^ *"//' -e 's/" *$//'
}

case "$ACTION" in
  create)
    [ $# -eq 3 ] || usage
    P12=$3
    : "${MACOS_HELPER_CERT_PASSWORD:?set MACOS_HELPER_CERT_PASSWORD to the .p12 password}"
    # Random password: the keychain only lives for one build.
    KC_PASS=$(openssl rand -hex 16)
    security create-keychain -p "$KC_PASS" "$KEYCHAIN"
    security set-keychain-settings -lut 3600 "$KEYCHAIN"
    security unlock-keychain -p "$KC_PASS" "$KEYCHAIN"
    security import "$P12" -k "$KEYCHAIN" -f pkcs12 \
      -P "$MACOS_HELPER_CERT_PASSWORD" -T /usr/bin/codesign >/dev/null
    # Let codesign use the key without a "codesign wants to access" dialog.
    security set-key-partition-list -S apple-tool:,apple:,codesign: \
      -s -k "$KC_PASS" "$KEYCHAIN" >/dev/null
    OLD=$(search_list | tr '\n' ' ')
    # shellcheck disable=SC2086
    security list-keychains -d user -s "$KEYCHAIN" $OLD
    # The self-signed certificate is not trusted, so `find-identity -v`
    # would skip it; codesign does not need trust to sign.
    security find-identity -p codesigning "$KEYCHAIN" |
      awk '/^ *[0-9]+\) [0-9A-F]{40}/ { print $2; exit }'
    ;;
  delete)
    REST=$(search_list | grep -vxF "$KEYCHAIN" | tr '\n' ' ')
    # shellcheck disable=SC2086
    security list-keychains -d user -s $REST
    security delete-keychain "$KEYCHAIN" 2>/dev/null || true
    ;;
  *) usage ;;
esac
