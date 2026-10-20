#!/bin/sh
# Museum table: a card that is zoomed keeps its lines (ZN-726). tests/data/museum_zoom/project.json: a text card and a photograph. A tap
# on its folded corner turns the photograph over to its notice (frames 5-7); two fingers spread from 100 to 300 units apart on the text
# card (30-90), then on the notice (100-160), which zooms each from 1 to 3 (1920x1080, one table unit per pixel). Every frame of the two
# zooms draws the same lines of text (tools/scene-texts over the frames' scene dumps): the texts of a card are cut once at the designed
# size and the card is drawn through one matrix, so no word changes line while it grows. Before, each frame set them again in the font
# of its size and the breaks moved at the second frame of each zoom. The compiled program ends on the frame of the interpreter.
cd "$(dirname "$0")/../.." || exit 2
tools=$PWD/tools
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/assets"; cp tests/data/museum_zoom/project.json "$tmp/assets/"
awk 'BEGIN { print "5 touch 1 1527 682"; print "7 touchup 1"
  for (c = 0; c < 2; c++) { first = c ? 100 : 30; cx = c ? 1350 : 520
    for (f = first; f <= first + 60; f++) { d = 50 * (1 + 2 * (f - first) / 60); printf "%d touch 1 %.1f 540\n%d touch 2 %.1f 540\n", f, cx - d, f, cx + d }
    printf "%d touchup 1\n%d touchup 2\n", first + 61, first + 61 } }' > "$tmp/zoom.input"
cd examples/museum-table || exit 2
fail=0
session() {  # more environment, then the zinc command: the poses on stdout, the hash of the last frame in $tmp/hash
  env ZINC_ASSETS="$tmp/assets" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$tmp/zoom.input" ZINC_FRAMES=165 ZINC_FRAMEHASH=last "$@" 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" > "$tmp/hash"
}
session ZINC_SCENE_DUMP="$tmp/s.zscn" ZINC_SHOT_EVERY=1 "$ZINC" run --interp . -- --log > "$tmp/log"
cp "$tmp/hash" "$tmp/interp"
grep -q '^91 note .* scale=3\.0000 ' "$tmp/log" && grep -q '^161 wave .* scale=3\.0000 .* face=1\.00$' "$tmp/log" ||
  { echo "museum_zoom: the session did not zoom the text card and the notice to 3: $(tail -2 "$tmp/log")"; fail=1; }
[ "$(python3 "$tools/scene-texts" "$tmp/s-31.zscn" | wc -l)" -ge 12 ] || { echo "museum_zoom: frame 31 draws fewer than 12 lines of text"; fail=1; }
for first in 31 101; do   # the frames of each zoom, from the one where the card was raised
  dumps=; f=$first
  while [ $f -le $((first + 60)) ]; do dumps="$dumps $tmp/s-$f.zscn"; f=$((f + 1)); done
  python3 "$tools/scene-texts" --same $dumps || { echo "museum_zoom: the lines of a card changed while it was zoomed"; fail=1; }
done
session "$ZINC" run . > /dev/null
[ -s "$tmp/interp" ] && cmp -s "$tmp/hash" "$tmp/interp" || { echo "museum_zoom: the compiled program ends on another frame: $(cat "$tmp/hash") / $(cat "$tmp/interp")"; fail=1; }
[ $fail = 0 ] && echo "museum_zoom: ok"
exit $fail
