#!/bin/sh
# Museum table, the light table (ZN-650.03): a scripted session of two hands on two cards at once (tests/data/museum_table/hands.py: drag, a
# second finger lands, turn and zoom, a finger lifts in the middle, release with a glide; then a tap on a folded corner, a double tap and a
# tap) gives, on the interpreter and compiled, the same frames (tests/golden/museum-table/frames.txt: two hands in mid-gesture, a card
# turned over, the full view, at rest) and the same log of card poses (tests/data/museum_table/expected.log). The log must also be continuous:
# from one frame to the next no card moves more than the fingers did, in particular on the frames where a finger lands or lifts.
# The window's GL renderer, when there is one, must draw the table like the software raster (tolerance of TESTING.md; in a window that
# fits a laptop screen).
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_table; golden=$PWD/tests/golden/museum-table/frames.txt; tools=$PWD/tools
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd ../examples/museum-table || exit 2
fail=0
session() {  # frames, then extra arguments of zinc run: the log on stdout, the hash of the last frame in $tmp/hash
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$d/hands.input" ZINC_FRAMES=$1 ZINC_FRAMEHASH=last "$ZINC" run $2 . -- --log 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" > "$tmp/hash"
}
for mode in "--interp" ""; do
  name=${mode:-compiled}
  : > "$tmp/frames"
  for n in 40 108 130 160; do session $n "$mode" > "$tmp/log"; cat "$tmp/hash" >> "$tmp/frames"; done
  cmp -s "$tmp/frames" "$golden" || { echo "museum_table ($name): frames differ from the golden"; diff "$tmp/frames" "$golden" | head -6; fail=1; }
  cmp -s "$tmp/log" "$d/expected.log" || { echo "museum_table ($name): the poses differ from expected.log"; diff "$tmp/log" "$d/expected.log" | head -6; fail=1; }
done

# continuity: per card, the largest step between two consecutive frames, and the steps on the frames where its number of fingers changes
LC_ALL=C awk '
  { split($3, a, "="); split($4, b, "="); split($5, c, "="); split($6, e, "="); split($7, f, "="); id = $2
    if (id in x && $1 == at[id] + 1) {
      dx = a[2] - x[id]; dy = b[2] - y[id]; ds = c[2] / s[id]; dr = e[2] - r[id]
      if (dx < 0) dx = -dx; if (dy < 0) dy = -dy; if (dr < 0) dr = -dr; if (ds < 1) ds = 1 / ds
      if (dx > 16 || dy > 16 || dr > 3 || ds > 1.06) { printf "frame %s: %s jumps by %.1f, %.1f units, %.2f degrees, x%.3f\n", $1, id, dx, dy, dr, ds; bad = 1 }
      if (f[2] != n[id]) changes++
    }
    at[id] = $1; x[id] = a[2]; y[id] = b[2]; s[id] = c[2]; r[id] = e[2]; n[id] = f[2] }
  END { if (changes < 6) { print "the session has only " changes + 0 " finger changes on a moving card"; bad = 1 } exit bad }' "$d/expected.log" || fail=1

if command -v python3 >/dev/null; then   # the software frame is drawn at the pixel density the GL window turned out to have
  ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_SIZE=960x540 ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run . >/dev/null 2>&1
  if [ -s "$tmp/gl.bmp" ]; then
    density=$(python3 -c 'import struct, sys; print(max(1, min(4, struct.unpack("<i", open(sys.argv[1], "rb").read()[18:22])[0] // 960)))' "$tmp/gl.bmp")
    ZINC_DETERMINISTIC=1 ZINC_SCALE=$density ZINC_SIZE=960x540 ZINC_FRAMES=3 ZINC_SHOT="$tmp/soft.png" "$ZINC" run . >/dev/null 2>&1
    out=$(python3 "$tools/glcompare" "$tmp/gl.bmp" "$tmp/soft.png")
    python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 5 or float(m.group(2)) > 3: print("museum_table: the GL renderer draws another table: %s (limits 5%% / 3)" % sys.argv[1]); sys.exit(1)
PY
  else echo "museum_table: GL renderer skipped, no GL window here"; fi
fi
[ $fail = 0 ] && echo "museum_table: ok"
exit $fail
