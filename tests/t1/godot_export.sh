#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
if [ -z "${GODOT:-}" ]; then
  echo 'SKIP godot_export: set GODOT to Godot 4.6-stable (tools/godot/fetch)'
  exit 77
fi
output=$(mktemp -d)
trap 'rm -rf "$output" "$output.staging"' EXIT HUP INT TERM
"$GODOT" --headless --path "$root/examples/godot-to-zinc/godot" --script test_export.gd -- "$output" > "$output/log" 2>&1
cat "$output/log"
"$root/tools/scene-exchange" "$output/scene.json"
python3 - "$output/scene.json" <<'PY'
import json,sys
scene=json.load(open(sys.argv[1]))
nodes={n['id']:n for n in scene['nodes']}
assert len(scene['assets'])==3
assert nodes['crate-a']['asset']==nodes['crate-b']['asset']==nodes['crate-c']['asset']
assert nodes['crate-c']['parent']=='stacks'
assert nodes['crate-c']['translation']==[.7,1,0] or abs(nodes['crate-c']['translation'][0]-.7)<1e-6
assert nodes['camera']['metadata']['camera']['fov']==55
assert nodes['spawn']['metadata']['spawn']['name']=='courier'
PY
"$ZINC" check "$root/examples/godot-to-zinc"
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_INPUT="$root/tests/data/godot-export/session.input" "$ZINC" run "$root/examples/godot-to-zinc" > "$output/play.log" 2>&1
cat "$output/play.log"
rg -q "delivery complete, gate open" "$output/play.log"
rg -q "gate reset" "$output/play.log"
