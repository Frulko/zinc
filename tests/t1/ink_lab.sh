#!/bin/sh
# Ink Lab: a scripted session (marks as stroke JSON, from a held-out writer of the ink dataset) replayed through the live pen path:
# what the lab recognised after each step is compared with tests/golden/ink-lab/session.txt (labels and the score of the live guess, which shows the net that read it; no timings).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
python3 - "$tmp/pen.json" <<'PY' || exit 1
import json, sys
d = json.load(open('tools/ink-train/data/ink-set.json'))
writer = [w['id'] for w in d['writers'] if w['split'] == 'test'][0]
def sample(c):
    return [s['s'] for s in d['samples'] if s['w'] == writer and s['c'] == c][0]
def fit(strokes, x, y, size):   # scaled into a square of `size` (a fraction of the rectangle) with its corner at (x, y)
    xs = [v for s in strokes for v in s[0::2]]; ys = [v for s in strokes for v in s[1::2]]
    k = size / max(max(xs) - min(xs), max(ys) - min(ys)); x0, y0 = min(xs), min(ys)
    return [[round(x + (v - x0) * k if i % 2 == 0 else y + (v - y0) * k, 4) for i, v in enumerate(s)] for s in strokes]
def mark(c, x, y, size=0.25):
    return {'s': fit(sample(c), x, y, size)}
def diagonal(x0, y0, x1, y1):
    return [round(v, 4) for i in range(21) for v in (x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20)]
log = {'log': True}
steps = [mark('A', 0.08, 0.06), log, mark('E', 0.55, 0.06), log, mark('x', 0.08, 0.5), mark('line', 0.55, 0.55), log,
         {'undo': True}, log, {'restart': True}, log, {'mode': 1}, mark('tick', 0.3, 0.3), log, {'mode': 0}, mark('V', 0.3, 0.6), log, {'net': 1}, log, {'net': 0}, log,
         {'restart': True}, {**mark('A', 0.55, 0.06), 'pause': 40}, log,   # 640 ms between the strokes: still one mark
         {'restart': True}, {'mode': 1}, {'s': [diagonal(0.1, 0.1, 0.4, 0.4), diagonal(0.4, 0.1, 0.1, 0.4)], 'pause': 40}, log]   # two bars across: a cross, not two lines
json.dump({'steps': steps}, open(sys.argv[1], 'w'))
PY
out=$(INK_LAB_REPLAY="$tmp/pen.json" ZINC_EINK=1 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=1080x810 ZINC_FRAMES=2500 timeout 120 "$ZINC" run examples/ink-lab 2>&1) \
  || { echo "ink lab: $out"; exit 1; }
echo "$out" | grep '^lab-state' > "$tmp/got.txt"
if [ -n "$INK_LAB_UPDATE" ]; then cp "$tmp/got.txt" tests/golden/ink-lab/session.txt; fi
diff "$tmp/got.txt" tests/golden/ink-lab/session.txt >&2 || { echo "ink lab: session differs from tests/golden/ink-lab/session.txt"; exit 1; }
echo "ink lab: letters, shapes, undo, restart and the class modes read as the golden says"
