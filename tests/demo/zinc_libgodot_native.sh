#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
out="$root/examples/zinc-libgodot/build"
if [ ! -x "$out/rally" ] || [ ! -f "$out/libgodot.dylib" ]; then
  echo 'SKIP zinc_libgodot_native: run examples/zinc-libgodot/build.sh first'
  exit 77
fi
mkdir -p "$root/.logs"
rm -f "$root/.logs/libgodot-native.png"
ZINC_BACKGROUND=1 ZINC_FRAMES=500 timeout 30 "$out/rally" "$out/libgodot.dylib" --visual-test "$root/.logs/libgodot-native.png"
test -s "$root/.logs/libgodot-native.png"
