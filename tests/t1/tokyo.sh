#!/bin/sh
# examples/tokyo, Pocket Tokyo's flight on zinc:3d: the city's world from tools/city-world.py (cells, levels, sectors chosen natively), the tour over Shiba.
# The city is not in git (177 MB of PLATEAU / OpenStreetMap data, ODbL): the test is skipped until `examples/tokyo/tools/city-world.py fetch`
# and `build` have made it. One headless session: the readout counts the triangles of the levels chosen, the tour moves the eye (two frames
# differ), Start (frame 140) leaves the tour, the night draws the lamps (a night frame is darker but not black), the PSP's settings keep
# their triangle budget, and the control panel (Select, frame 205) shows its places and a click on Zojo-ji flies the eye there.
cd "$(dirname "$0")/../.." || exit 2
[ -f examples/tokyo/assets/city/city.txt ] || { echo "skipped: no city (python3 -I examples/tokyo/tools/city-world.py fetch, then build)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# the panel is an overlay at the right edge, vertically centred (960 x 544: its corner at 636, 152); Zojo-ji is its second place button
printf '140 pad Start\n142 padup Start\n205 pad Select\n207 padup Select\n215 move 864 228\n216 down\n218 up\n' > "$tmp/input"
run() {   # run <name> [env...]: 400 frames (the loading screen takes the first 15 to 40), shots at 80, 120, 198 and 230, the scene dumps
  name=$1; shift
  env "$@" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=${frames:-200} ZINC_INPUT="$tmp/input" ZINC_SHOT="$tmp/$name.png" ZINC_SHOT_FRAMES=80,120,198,230 \
    ZINC_SCENE_DUMP="$tmp/$name" "$ZINC" run examples/tokyo >"$tmp/$name.out" 2>&1 || { echo "tokyo: the $name run failed: $(tail -5 "$tmp/$name.out")"; exit 1; }
}
frames=400 run day ZINC_TOKYO_HOUR=12
run night ZINC_TOKYO_HOUR=21
run psp ZINC_TOKYO_HOUR=12 ZINC_TOKYO_DEVICE=psp
run n3ds ZINC_TOKYO_HOUR=12 ZINC_TOKYO_DEVICE=n3ds
fail=0
grep -q 'tokyo: [0-9]* chunks read' "$tmp/day.out" || { echo "tokyo: the loading screen did not end"; fail=1; }
tris() { python3 tools/scene-texts "$1" | sed -n 's/.* \([0-9][0-9]*\) tris .*/\1/p' | head -1; }
day=$(tris "$tmp/day-120"); psp=$(tris "$tmp/psp-120"); n3ds=$(tris "$tmp/n3ds-120")
[ -n "$day" ] && [ "$day" -gt 20000 ] || { echo "tokyo: the desktop readout shows ${day:-no} triangles"; fail=1; }
# the PSP's budget is 42000 triangles (src/devices.ts, Pocket Tokyo's): the governor keeps it within a few per cent, fewer than the desktop's
[ -n "$psp" ] && [ "$psp" -gt 1000 ] && [ "$psp" -le 44000 ] && [ "$psp" -lt "$day" ] || { echo "tokyo: the PSP's settings draw ${psp:-no} triangles (the desktop's $day)"; fail=1; }
# the 3DS's: the near level in 40 slots (World.slots) within its 60000 triangles
[ -n "$n3ds" ] && [ "$n3ds" -gt 1000 ] && [ "$n3ds" -le 63000 ] || { echo "tokyo: the 3DS's settings draw ${n3ds:-no} triangles"; fail=1; }
python3 tools/scene-texts "$tmp/day-80" | grep -q 'tour' || { echo "tokyo: not on the tour at frame 80"; fail=1; }
python3 tools/scene-texts "$tmp/day-198" | grep -q 'free' || { echo "tokyo: Start did not leave the tour"; fail=1; }
python3 tools/scene-texts "$tmp/day-230" | grep -q 'Shinbashi' || { echo "tokyo: Select did not open the panel's places"; fail=1; }
grep -q 'tokyo: at Zojo-ji, free flight, 0.0 m from its view' "$tmp/day.out" || { echo "tokyo: the panel did not fly the eye to Zojo-ji"; fail=1; }
python3 - "$tmp/day-80.png" "$tmp/day-120.png" "$tmp/night-120.png" <<'P' || fail=1
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
[ $fail -eq 0 ] && echo "tokyo: ok (desktop $day triangles, PSP settings $psp, 3DS settings $n3ds)"
exit $fail
