#!/bin/sh
# examples/3d/orbit, the console 3D demo, on the desktop: the system view draws the planet and its readout, Start goes to the rings view (the
# camera glides closer: another frame) and Y hides the readout. One scripted headless session on the interpreter.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf '20 pad Start\n22 padup Start\n100 pad Y\n102 padup Y\n' > "$tmp/input"
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=112 ZINC_INPUT="$tmp/input" ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=15,90,110 \
  ZINC_SCENE_DUMP="$tmp/s" "$ZINC" run examples/3d/orbit --interp >"$tmp/out" 2>&1 || { echo "orbit: the run failed: $(tail -5 "$tmp/out")"; exit 1; }
fail=0
python3 tools/scene-texts "$tmp/s-15" | grep -q "tris  CPU  System\|tris  GPU  System" || { echo "orbit: no readout in the system view"; fail=1; }
python3 tools/scene-texts "$tmp/s-90" | grep -q "Rings" || { echo "orbit: Start did not go to the rings view"; fail=1; }
python3 tools/scene-texts "$tmp/s-110" | grep -q "fps" && { echo "orbit: Y did not hide the readout"; fail=1; }
python3 - "$tmp/f-15.png" "$tmp/f-90.png" <<'P' || fail=1
import importlib.machinery, sys
dec = importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff').load_module().dec
def middle(p):
    w, h, bpp, px = dec(p)
    return [px[(y * w + x) * bpp:(y * w + x) * bpp + 3] for y in range(h // 3, 2 * h // 3, 5) for x in range(w // 3, 2 * w // 3, 5)]
a, b = middle(sys.argv[1]), middle(sys.argv[2])
if len(set(a)) < 20: print('orbit: the planet is not drawn (%d colours in the middle)' % len(set(a))); sys.exit(1)
if sum(1 for x, y in zip(a, b) if x != y) < len(a) // 4: print('orbit: the rings view looks like the system view'); sys.exit(1)
P
[ $fail -eq 0 ] && echo "orbit: ok"
exit $fail
