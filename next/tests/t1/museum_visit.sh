#!/bin/sh
# Museum table, the story (ZN-650.05): the player follows the links of the sample project the way Klynt's player does. Two scripted
# sessions (tests/data/museum_visit/visit.py), on the interpreter and compiled:
#   visit.input  a hotspot on a card opens a sequence over the prints (overlay, fade), its button closes it (none); a button leads on with a
#                fade, two more with a slide (to the 3D object, to the panorama); a look around the panorama, a point of interest, the button
#                of its panel (a link again); the language button. The story log is expected.story and six frames have the hashes of
#                tests/golden/museum-visit/frames.txt: a card coming in at its time with the hotspot on another, the overlay, the middle of
#                the fade and of the slide, the panorama with its panel, the sequence in English.
#   wait.input   the overlay again, left alone: after its 30 seconds it gives way to its `next` (wait.story).
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run (interpreter).
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_visit; golden=$PWD/tests/golden/museum-visit/frames.txt
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd ../examples/museum-table || exit 2
fail=0
play() {  # input, frames, mode: the story on stdout, the hash of the last frame in $tmp/hash
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$d/$1" ZINC_FRAMES=$2 ZINC_FRAMEHASH=last "$ZINC" run $3 . -- --story 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" > "$tmp/hash"
}
for mode in "--interp" ""; do
  name=${mode:-compiled}
  : > "$tmp/frames"
  for n in 134 200 242 412 700 880; do play visit.input $n "$mode" > "$tmp/story"; cat "$tmp/hash" >> "$tmp/frames"; done
  play wait.input 2100 "$mode" > "$tmp/wait"
  if [ -n "$ZN_UPDATE_GOLDEN" ] && [ -n "$mode" ]; then cp "$tmp/frames" "$golden"; cp "$tmp/story" "$d/expected.story"; cp "$tmp/wait" "$d/wait.story"; fi
  cmp -s "$tmp/frames" "$golden" || { echo "museum_visit ($name): frames differ from the golden"; diff "$tmp/frames" "$golden" | head -8; fail=1; }
  cmp -s "$tmp/story" "$d/expected.story" || { echo "museum_visit ($name): the story differs from expected.story"; diff "$tmp/story" "$d/expected.story" | head -8; fail=1; }
  cmp -s "$tmp/wait" "$d/wait.story" || { echo "museum_visit ($name): the story of the wait differs from wait.story"; diff "$tmp/wait" "$d/wait.story" | head -8; fail=1; }
done
[ $fail = 0 ] && echo "museum_visit: ok"
exit $fail
