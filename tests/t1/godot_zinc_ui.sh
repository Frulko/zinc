#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
if [ -z "${GODOT:-}" ] || [ ! -f "$root/examples/godot-zinc-ui/godot/bin/libzinc_godot.dylib" ]; then
  echo 'SKIP godot_zinc_ui: build examples/godot-zinc-ui/build.sh and set GODOT'
  exit 77
fi
"$GODOT" --headless --editor --path "$root/examples/godot-zinc-ui/godot" --import
"$GODOT" --headless --path "$root/examples/godot-zinc-ui/godot" -- --self-test
GODOT="$GODOT" "$root/examples/godot-zinc-ui/package.sh"
cd "${TMPDIR:-/tmp}"
"$root/examples/godot-zinc-ui/build/Warehouse.app/Contents/MacOS/Warehouse" --headless -- --self-test
