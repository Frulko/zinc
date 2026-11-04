#!/bin/sh
set -eu
[ "$(uname)" = Darwin ] || exit 77
[ -z "${ZINC_CI:-}" ] || { echo 'skipped: needs a real window compositor'; exit 77; }
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
build=$(dirname "${ZINC:-build/zinc}")
"${CXX:-c++}" -std=c++17 -O2 -fobjc-arc -Wall -Wextra -Ithird_party/SDL3/include -Iruntime/include \
  tests/native/surface_present.mm "$build/third_party/SDL3/libSDL3.a" \
  -framework Cocoa -framework CoreMedia -framework CoreVideo -framework IOKit -framework Carbon \
  -framework Foundation -framework Metal -framework QuartzCore -framework IOSurface -framework AppKit \
  -framework CoreFoundation -framework CoreGraphics -framework CoreServices -framework GameController \
  -framework CoreHaptics -framework ForceFeedback -weak_framework UniformTypeIdentifiers -o "$tmp/test"
ZINC_BACKGROUND=1 timeout -k 2 20 "$tmp/test"
