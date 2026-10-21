#!/bin/sh
# Museum table, the table mode (ZN-650.06): one or two visitors around a table, a kiosk nobody attends. Scripted sessions
# (tests/data/museum_mode/sessions.py), on the interpreter:
#   sides.input  a touch at each edge in turn turns the texts, the buttons and the 3D object to that side (story: side top, right, left,
#                bottom), and a touch on a point of the vase opens its panel turned to that side: four frames (golden/museum-mode/sides.txt)
#   two.input    two visitors on opposite sides take turns: each opens a print in full, turned to the side they touched from, each follows
#                a link with the buttons at their own edge; the story has every sequence once (two.story) and two frames (two.txt)
#   idle.input   a visitor changes the language, moves a card, goes on and turns the table, then leaves: the attract loop starts after the
#                60 seconds of the project and the visit is forgotten after 120 (idle.story). A touch then finds the table exactly as a
#                table just started shows it after the same touch (fresh.input): the two frames have the same hash.
#   a project file that cannot be read: the fault is on the error output, the table shows nothing of it and runs on.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run (interpreter).
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_mode; g=$PWD/tests/golden/museum-mode
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd examples/museum-table || exit 2
fail=0
play() {  # input, frames, mode, arguments of the app: the story on stdout, the hash of the last frame in $tmp/hash
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$d/$1" ZINC_FRAMES=$2 ZINC_FRAMEHASH=last "$ZINC" run $3 . -- --story $4 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" > "$tmp/hash"
}
same() {  # what, file, golden
  if [ -n "$ZN_UPDATE_GOLDEN" ] && [ -n "$mode" ]; then cp "$2" "$3"; fi
  cmp -s "$2" "$3" || { echo "museum_mode ($name): $1 differs from $3"; diff "$2" "$3" | head -8; fail=1; }
}
mkdir -p "$g"
for mode in "--interp"; do   # headless, `zinc run` interprets: the AOT program is museum_visit's and the T2 *_aot tests'
  name=${mode:-compiled}
  : > "$tmp/sides"; : > "$tmp/two"
  for n in 100 240 380 520; do play sides.input $n "$mode" "--sequence porcelain" > "$tmp/sides.story"; cat "$tmp/hash" >> "$tmp/sides"; done
  for n in 170 420; do play two.input $n "$mode" "" > "$tmp/two.story"; cat "$tmp/hash" >> "$tmp/two"; done
  same "the frames of the four sides" "$tmp/sides" "$g/sides.txt"
  same "the story of the four sides" "$tmp/sides.story" "$d/sides.story"
  same "the frames of the two visitors" "$tmp/two" "$g/two.txt"
  same "the story of the two visitors" "$tmp/two.story" "$d/two.story"
  play idle.input 9040 "$mode" "" > "$tmp/idle.story"; cp "$tmp/hash" "$tmp/after"
  play fresh.input 50 "$mode" "" > /dev/null
  same "the story of the idle table" "$tmp/idle.story" "$d/idle.story"
  [ "$(cut -d' ' -f2- "$tmp/after")" = "$(cut -d' ' -f2- "$tmp/hash")" ] && [ -s "$tmp/hash" ] || { echo "museum_mode ($name): after the reset the table is not as new: $(cat "$tmp/after") / $(cat "$tmp/hash")"; fail=1; }
done
for line in ' side top' ' side right' ' side left' ' side bottom'; do grep -qF -- "$line" "$d/sides.story" || { echo "museum_mode: sides.story has no \"$line\""; fail=1; }; done
for line in ' attract start' ' visit end' ' reset: sequence ukiyo-e, language fr, side bottom, 0 seen' ' attract stop'; do
  grep -qF -- "$line" "$d/idle.story" || { echo "museum_mode: idle.story has no \"$line\""; fail=1; }
done
[ "$(grep -c ' sequence ' "$d/two.story")" = 3 ] || { echo "museum_mode: the two visitors do not share one story: $(grep ' sequence ' "$d/two.story" | tr '\n' ' ')"; fail=1; }

# a kiosk shows no error: a project that cannot be read gives a table with nothing on it, and the fault on the error output
mkdir "$tmp/assets"; echo '{ "format": "zinc-museum-table", "version": 99 }' > "$tmp/assets/project.json"
ZINC_ASSETS="$tmp/assets" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_FRAMES=5 ZINC_FRAMEHASH=last "$ZINC" run . > "$tmp/out" 2> "$tmp/err" || { echo "museum_mode: the table stops on a project it cannot read"; fail=1; }
grep -q 'museum-table: project.json: version: 99 is newer than this player' "$tmp/err" || { echo "museum_mode: the unreadable project is not reported: $(head -c 300 "$tmp/err")"; fail=1; }
grep -q '^zinc: framehash 5 ' "$tmp/err" || { echo "museum_mode: no frame with a project that cannot be read"; fail=1; }
[ -s "$tmp/out" ] && { echo "museum_mode: the table says something to the visitor about the fault: $(head -c 200 "$tmp/out")"; fail=1; }
[ $fail = 0 ] && echo "museum_mode: ok"
exit $fail
