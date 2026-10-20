#!/bin/sh
# Museum table, the 3D object viewer (ZN-650.04): a scripted session on the vase of the sample (tests/data/museum_viewer/session.py: one
# finger turns it a quarter turn, two fingers bring it closer and move it, a tap on a point of interest opens its description and glides to
# its view, a tap on a button glides back to the start, another changes the lighting) gives, on the interpreter and compiled, the frames of
# tests/golden/museum-viewer/frames.txt (software renderer: zoomed and moved, a point open, raking light at the start view) and the view
# log of tests/data/museum_viewer/expected.log. The GPU renderer of zinc:3d draws the frame with the open point within tolerance. With
# --pins a red ball sits on every point of interest of the object itself: at four views each one that faces the camera is drawn within
# 4 pixels of where the viewer says the point is, so a point stays on its place of the object at every angle.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
d=$PWD/tests/data/museum_viewer; golden=$PWD/tests/golden/museum-viewer/frames.txt; tools=$PWD/tools
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd examples/museum-table || exit 2
fail=0
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$d/session.input"
for mode in "--interp" ""; do
  name=${mode:-compiled}
  : > "$tmp/frames"
  for n in 75 130 205; do
    ZINC_FRAMES=$n ZINC_FRAMEHASH=last "$ZINC" run $mode . -- --sequence porcelain --log 2>"$tmp/err" | grep -E "^[0-9]+ (view|point) " > "$tmp/log"
    sed -n 's/^zinc: framehash //p' "$tmp/err" >> "$tmp/frames"
  done
  cmp -s "$tmp/frames" "$golden" || { echo "museum_viewer ($name): frames differ from the golden"; diff "$tmp/frames" "$golden" | head -6; fail=1; }
  cmp -s "$tmp/log" "$d/expected.log" || { echo "museum_viewer ($name): the views differ from expected.log"; diff "$tmp/log" "$d/expected.log" | head -6; fail=1; }
done

# the GPU renderer (the software one again where there is no GPU context) against the software frame
ZINC_FRAMES=130 ZINC_SHOT="$tmp/soft.png" "$ZINC" run . -- --sequence porcelain >/dev/null 2>&1
ZINC_3D=gpu ZINC_FRAMES=130 ZINC_SHOT="$tmp/gpu.png" "$ZINC" run . -- --sequence porcelain >/dev/null 2>&1
out=$(python3 "$tools/pngdiff" "$tmp/gpu.png" "$tmp/soft.png" --tol 24 --max-diff 62208) || { echo "museum_viewer: the GPU renderer draws another object: $out (limit 3 % of the pixels over 24)"; fail=1; }

# a point stays on its place: the pins of the object against the positions the viewer gives
ZINC_FRAMES=190 ZINC_SHOT="$tmp/pin.png" ZINC_SHOT_FRAMES=35,75,130,190 "$ZINC" run . -- --sequence porcelain --pins --log 2>/dev/null | grep -E "^[0-9]+ point " > "$tmp/points"
python3 - "$tmp" "$tools/pngdiff" <<'PY' || fail=1
import sys, importlib.machinery, importlib.util
t = sys.argv[1]
spec = importlib.util.spec_from_loader('pd', importlib.machinery.SourceFileLoader('pd', sys.argv[2])); pd = importlib.util.module_from_spec(spec); spec.loader.exec_module(pd)
lines = [l.split() for l in open(t + '/points')]
seen = bad = 0
for frame in (35, 75, 130, 190):
    w, h, bpp, px = pd.dec(f'{t}/pin-{frame}.png')
    last = {}
    for l in lines:                      # the log is written before the frame counter moves: frame N of the capture is line N - 1
        if int(l[0]) <= frame - 1: last[l[2]] = (float(l[4]), float(l[5]), l[6])
    for name, (x, y, side) in sorted(last.items()):
        if side != 'facing' or not (30 < x < w - 30 and 30 < y < h - 30): continue
        sx = sy = n = 0
        for yy in range(int(y) - 24, int(y) + 24):
            for xx in range(int(x) - 24, int(x) + 24):
                o = (yy * w + xx) * bpp
                if px[o] > 170 and px[o + 1] < 70 and px[o + 2] < 70: sx += xx + 0.5; sy += yy + 0.5; n += 1
        seen += 1
        off = ((sx / n - x) ** 2 + (sy / n - y) ** 2) ** 0.5 if n else 1e9
        if off > 4: bad += 1; print(f'frame {frame}: the pin of "{name}" is {"not drawn" if not n else "%.1f px" % off} from where the viewer puts the point ({x:.1f}, {y:.1f})')
if seen < 6: print(f'only {seen} points facing the camera were checked, 6 expected'); sys.exit(1)
sys.exit(1 if bad else 0)
PY
[ $fail = 0 ] && echo "museum_viewer: ok"
exit $fail
