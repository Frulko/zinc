#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
out="$root/examples/zinc-libgodot/build"
if [ ! -f "$out/rally" ] || [ ! -f "$out/libgodot.dylib" ]; then
  echo 'SKIP zinc_libgodot: run examples/zinc-libgodot/build.sh first'
  exit 77
fi
ZINC_BACKGROUND=1 ZINC_FRAMES=500 "$out/rally" "$out/libgodot.dylib" --self-test
"$root/examples/zinc-libgodot/package.sh"
cd "${TMPDIR:-/tmp}"
ZINC_BACKGROUND=1 ZINC_FRAMES=500 "$out/Zinc Pocket Rally.app/Contents/MacOS/Launcher" --self-test
