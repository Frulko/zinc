#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
: "${GODOT:?set GODOT to the pinned Godot executable}"
[ -f "$root/examples/godot-zinc-ui/godot/bin/libzinc_godot.dylib" ] || { echo 'Build examples/godot-zinc-ui/build.sh first'; exit 77; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
cp -R "$root/examples/godot-zinc-ui/godot/." "$tmp/"
printf '[display]\nwindow/size/no_focus=true\n' > "$tmp/override.cfg"
export ZINC_BACKGROUND=1 ZINC_CAPTURE=${ZINC_CAPTURE:-$tmp/warehouse.png}
"$GODOT" --headless --editor --path "$tmp" --import > "$tmp/import.log" 2>&1 || { cat "$tmp/import.log"; exit 1; }
timeout 40 "$GODOT" --path "$tmp" -- --visual-proof
