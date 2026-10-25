#!/bin/sh
# Native capture combines eye callbacks into refreshes and the gate rejects actual stalls.
cd "$(dirname "$0")/../.." || exit 2
root=$PWD
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
${CXX:-c++} -std=c++17 -O2 -Iinclude -Iruntime/include tests/native/n3ds_frame_profile.cpp targets/n3ds/frame_profile.cpp -o "$tmp/check" || exit 1
mkdir "$tmp/sdmc:"
(cd "$tmp" && ./check) || exit 1
"$root/tools/n3ds-frame-report" "$tmp/sdmc:/zinc-frames.csv" --source test --warmup 0 --gate > "$tmp/report.json" || exit 1
python3 - "$tmp" <<'PY'
import csv,json,sys
from pathlib import Path
p=Path(sys.argv[1]); d=json.loads((p/'report.json').read_text())
f=d['modes']['flat']; s=d['modes']['stereo']
assert f['refreshes']==4 and s['refreshes']==4
assert f['physics_us']['p50']==500 and s['physics_us']['p50']==1000
assert f['rt_allocs']['p50']==10 and s['rt_allocs']['p50']==20
assert f['physics_steps']['p50']==2 and s['physics_steps']['p50']==3
assert f['missed_refreshes']==s['missed_refreshes']==0
file=p/'sdmc:/zinc-frames.csv'
with file.open() as inp:
 header=inp.readline(); rows=list(csv.DictReader(inp)); fields=list(rows[0])
rows[3]['gap_us']='50145'
with file.open('w') as out:
 out.write(header); w=csv.DictWriter(out,fieldnames=fields);w.writeheader();w.writerows(rows)
PY
[ $? -eq 0 ] || exit 1
if "$root/tools/n3ds-frame-report" "$tmp/sdmc:/zinc-frames.csv" --source test --warmup 0 --gate > "$tmp/stalled.json"; then
  echo 'missed refresh gate accepted a 50 ms gap'; exit 1
fi

# The capture retains the latest minute instead of stopping when its memory fills.
(cd "$tmp" && ./check ring) || exit 1
python3 - "$tmp/sdmc:/zinc-frames.csv" <<'PYTEST'
import csv,sys
with open(sys.argv[1]) as f:
 header=f.readline(); rows=list(csv.DictReader(f))
assert 'omitted=5' in header
assert len(rows)==3600 and int(rows[0]['refresh'])==5 and int(rows[-1]['refresh'])==3604
PYTEST
