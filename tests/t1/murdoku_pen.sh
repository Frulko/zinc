#!/bin/sh
# Murdoku pen input (ZN-935): a scripted pen session (marks as stroke JSON, taken from a held-out writer of the ink dataset) replayed through the
# live pen path on the e-ink skin (ZINC_EINK=1, headless): a circled A places person A, a bare B is a pencil note, an X crosses a cell out, a line
# stays as ink, a two-finger tap undoes the last move (the cross). Puzzle: the default one (seed 3301, level 1: A solves at cell 12, B at 21).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
python3 - "$tmp/pen.json" <<'PY' || exit 1
import json, math, sys
d = json.load(open('tools/ink-train/data/ink-set.json'))
writer = [w['id'] for w in d['writers'] if w['split'] == 'test'][0]
def sample(c):
    return [s['s'] for s in d['samples'] if s['w'] == writer and s['c'] == c][0]
def fit(strokes, x, y, size):   # scaled into a square of `size` (a fraction of the cell) with its corner at (x, y)
    xs = [v for s in strokes for v in s[0::2]]; ys = [v for s in strokes for v in s[1::2]]
    k = size / max(max(xs) - min(xs), max(ys) - min(ys)); x0, y0 = min(xs), min(ys)
    return [[round(x + (v - x0) * k if i % 2 == 0 else y + (v - y0) * k, 4) for i, v in enumerate(s)] for s in strokes]
circle = [round(0.5 + 0.44 * f(t * 2 * math.pi * 1.03), 4) for t in [i / 23 for i in range(24)] for f in (math.cos, math.sin)]
steps = [
  {'cell': 12, 's': fit(sample('A'), 0.3, 0.3, 0.4) + [circle]},
  {'cell': 21, 's': fit(sample('B'), 0.2, 0.2, 0.6)},
  {'cell': 2, 's': fit(sample('x'), 0.15, 0.15, 0.7)},
  {'cell': 5, 's': fit(sample('line'), 0.1, 0.5, 0.8)},
  {'undo': True},
]
json.dump({'steps': steps}, open(sys.argv[1], 'w'))
PY
out=$(MURDOKU_PEN_REPLAY="$tmp/pen.json" ZINC_EINK=1 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1620x2160 ZINC_FRAMES=1500 timeout 120 "$ZINC" run examples/murdoku 2>&1) \
  || { echo "murdoku pen: $out"; exit 1; }
line=$(echo "$out" | grep '^pen-state')
python3 - "$line" <<'PY' || { echo "murdoku pen: $line"; exit 1; }
import sys
f = dict(kv.split('=') for kv in sys.argv[1].split()[1:])
placements = [int(v) for v in f['placements'].split(',')]
notes = [int(v) for v in f['notes'].split(',')]
elim = [int(v) for v in f['eliminated'].split(',')]
assert placements[0] == 12 and placements[2:] == [-1] * 4 and placements[1] == -1, 'circled A: ' + f['placements']
assert [i for i, v in enumerate(notes) if v] == [21] and notes[21] == 1 << 2, 'bare B: ' + f['notes']
assert sum(elim) == 0, 'the two-finger tap undoes the cross: ' + f['eliminated']
assert f['ink'] == '1', 'the line stays as ink, the rest is typeset: ink=' + f['ink']
assert f['crossed'] == '1', 'the cross was made before the undo: ' + f['crossed']
PY
echo "murdoku pen: circled letter places, bare letter notes, X crosses, a line stays ink, two-finger tap undoes"
