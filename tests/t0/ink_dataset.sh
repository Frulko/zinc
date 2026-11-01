#!/bin/sh
# The ink training set (ZN-931): tools/ink-train/make-dataset is deterministic (two runs and the committed file are the same bytes),
# the file stays under 2 MB, every class has samples for train and test writers, and no writer is in both splits.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tools/ink-train/make-dataset --out "$tmp/a.json" >/dev/null || { echo "make-dataset failed"; exit 1; }
cmp -s "$tmp/a.json" tools/ink-train/data/ink-set.json || { echo "tools/ink-train/data/ink-set.json is not what make-dataset writes (rerun it)"; exit 1; }
size=$(wc -c <"$tmp/a.json")
[ "$size" -lt 2000000 ] || { echo "the set is $size bytes, 2 MB at most"; exit 1; }
python3 - "$tmp/a.json" <<'PY' || exit 1
import json, sys
d = json.load(open(sys.argv[1]))
split = {w['id']: w['split'] for w in d['writers']}
for part in ('train', 'test'):
    have = {s['c'] for s in d['samples'] if split[s['w']] == part}
    assert have == set(d['classes']), (part, set(d['classes']) - have)
assert all(s['s'] and all(len(p) >= 4 and len(p) % 2 == 0 for p in s['s']) for s in d['samples'])
print('ok', len(d['samples']), 'samples')
PY
