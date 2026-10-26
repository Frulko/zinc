#!/bin/sh
# Real background Cocoa presentation/input, through the exact HAL shipped in the legacy runtime.
set -eu
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = Darwin ] || exit 77
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
xcrun clang++ -arch x86_64 -mmacosx-version-min=10.12 -std=c++17 -Wall -Wextra -Werror=unguarded-availability-new \
  -Iruntime/include tests/native/macos_legacy.mm targets/common/hal_posix.cpp -framework Cocoa -o "$tmp/window"
ZINC_BACKGROUND=1 timeout 15 "$tmp/window" "${ZINC_CAPTURE:-$tmp/window.png}"
