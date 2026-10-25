#!/bin/sh
# Contract only: headless numbers are deliberately discarded.
set -eu
project=$(CDPATH= cd -- "$(dirname "$0")/godot" && pwd)
: "${GODOT:?set GODOT to the pinned executable}"
log=$(mktemp)
trap 'rm -f "$log"' EXIT HUP INT TERM
for workload in idle active; do
    timeout 30 "$GODOT" --headless --path "$project" -- --bench-frames 330 --bench-workload "$workload" >"$log" 2>&1
    python3 - "$log" "$workload" <<'PY'
import json, sys
lines = open(sys.argv[1]).read().splitlines()
prefix = 'workflow bench json: '
rows = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
assert len(rows) == 1, lines
row = rows[0]
assert row['schema'] == 1 and row['host'] == 'godot-warehouse'
assert row['workload'] == sys.argv[2] and row['warmup_frames'] == 30
assert row['total_frames'] == 330 and row['renderer'] == 'headless'
for key in ('interval_us', 'step_us', 'process_us'):
    assert len(row[key]) == 300 and all(value >= 0 for value in row[key]), key
assert row['uploads'] == (0 if sys.argv[2] == 'idle' else 300), row['uploads']
assert 'GPU completion' in row['boundaries']
assert not any('SCRIPT ERROR' in line or 'ERROR:' in line for line in lines), lines
PY
done
printf '%s\n' 'PASS Warehouse benchmark contract: idle, active, 300 samples, clean finite exit'
