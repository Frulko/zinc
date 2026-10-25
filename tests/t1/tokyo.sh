#!/bin/sh
# examples/tokyo, Pocket Tokyo's flight on zinc:3d: the city's GLBs from tools/city-gltf.py through the asset build, the tour over Shiba.
# The city is not in git (177 MB of PLATEAU / OpenStreetMap data, ODbL): the test is skipped until `examples/tokyo/tools/city-gltf.py fetch`
# and `build` have made it. One headless session: the readout counts the triangles of the levels chosen, the tour moves the eye (two frames
# differ), Start (frame 40) leaves the tour, the night draws the lamps (a night frame is darker but not black), and the PSP's settings draw fewer triangles.
cd "$(dirname "$0")/../.." || exit 2
[ -f examples/tokyo/assets/city/city.txt ] || { echo "skipped: no city (python3 -I examples/tokyo/tools/city-gltf.py fetch, then build)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf '40 pad Start\n42 padup Start\n' > "$tmp/input"
run() {   # run <name> [env...]: 90 frames, shots at 20, 60 and 88, the scene dumps
  name=$1; shift
  env "$@" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=90 ZINC_INPUT="$tmp/input" ZINC_SHOT="$tmp/$name.png" ZINC_SHOT_FRAMES=20,60,88 \
    ZINC_SCENE_DUMP="$tmp/$name" "$ZINC" run examples/tokyo >"$tmp/$name.out" 2>&1 || { echo "tokyo: the $name run failed: $(tail -5 "$tmp/$name.out")"; exit 1; }
}
run day ZINC_TOKYO_HOUR=12
run night ZINC_TOKYO_HOUR=21
run psp ZINC_TOKYO_HOUR=12 ZINC_TOKYO_DEVICE=psp
fail=0
tris() { python3 tools/scene-texts "$1" | sed -n 's/.* \([0-9][0-9]*\) tris .*/\1/p' | head -1; }
day=$(tris "$tmp/day-60"); psp=$(tris "$tmp/psp-60")
[ -n "$day" ] && [ "$day" -gt 20000 ] || { echo "tokyo: the desktop readout shows ${day:-no} triangles"; fail=1; }
[ -n "$psp" ] && [ "$psp" -gt 1000 ] && [ "$psp" -lt $((day / 2)) ] || { echo "tokyo: the PSP's settings draw ${psp:-no} triangles (the desktop's $day)"; fail=1; }
python3 tools/scene-texts "$tmp/day-20" | grep -q 'tour' || { echo "tokyo: not on the tour at frame 20"; fail=1; }
python3 tools/scene-texts "$tmp/day-88" | grep -q 'free' || { echo "tokyo: Start did not leave the tour"; fail=1; }
python3 - "$tmp/day-20.png" "$tmp/day-60.png" "$tmp/night-60.png" <<'P' || fail=1
import importlib.machinery, sys
dec = importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff').load_module().dec
def lower(p):
    w, h, bpp, px = dec(p)
    return [px[(y * w + x) * bpp:(y * w + x) * bpp + 3] for y in range(h // 2, h - 30, 6) for x in range(0, w, 6)]
a, b, n = lower(sys.argv[1]), lower(sys.argv[2]), lower(sys.argv[3])
if len(set(b)) < 200: print('tokyo: the city is not drawn (%d colours in the lower half)' % len(set(b))); sys.exit(1)
if sum(1 for x, y in zip(a, b) if x != y) < len(a) // 3: print('tokyo: the tour did not move the eye'); sys.exit(1)
lum = lambda s: sum(sum(p) for p in s) / len(s)
if not (lum(n) < lum(b) * 0.6 and len(set(n)) > 100): print('tokyo: the night frame is not a lit night (%.0f vs %.0f, %d colours)' % (lum(n), lum(b), len(set(n)))); sys.exit(1)
P
[ $fail -eq 0 ] && echo "tokyo: ok (desktop $day triangles, PSP settings $psp)"
exit $fail
