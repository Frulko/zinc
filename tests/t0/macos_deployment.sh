#!/bin/sh
# A Catalina engine's generated dev/export bundle must not advertise macOS 11.
set -eu
[ "$(uname -s)" = Darwin ] || exit 77
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
xcrun clang++ -arch x86_64 -mmacosx-version-min=10.15 -std=c++20 -Isrc \
  tests/native/macos_deployment.cpp src/tc/bundle.cpp src/platform/platform.cpp -framework CoreFoundation -o "$tmp/plist"
"$tmp/plist" > "$tmp/Info.plist"
python3 - "$tmp/Info.plist" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as f: p = plistlib.load(f)
assert p['LSMinimumSystemVersion'] == '10.15.0', p
print('macos_deployment: generated bundle follows the compiled 10.15 minimum')
PY
