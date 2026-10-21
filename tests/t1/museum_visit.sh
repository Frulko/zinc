#!/bin/sh
# Museum table, the story (ZN-650.05): the player plays the sample project the way Klynt's player plays a story. Two scripted sessions
# (tests/data/museum_visit/visit.py), on the interpreter; compiled, the frame of the overlay has the same hash:
#   visit.input  a hotspot on a card opens a sequence over the prints (overlay, fade), its button closes it (none); a button leads on with a
#                fade, two more with a slide (to the 3D object, to the panorama); a look around the panorama, a point of interest, the button
#                of its panel (a link again); the language button; the storyboard, and a touch on a node; then the guided presentation:
#                it starts with its narration and subtitles in English, a touch pauses it, the language goes back to French, "Resume" plays
#                the step again in French, and it runs through its five sequences to its end. The story log (sequences, links, the clip
#                asked for and each subtitle with its frame: the sound itself is not played headless) is expected.story, and eleven
#                frames have the hashes of tests/golden/museum-visit/frames.txt: a card coming in at its time with the hotspot on another,
#                the overlay, the middle of the fade and of the slide, the panorama with its panel and a subtitle, the sequence in English,
#                the storyboard with five sequences ticked and six links followed, the sequence jumped to, the presentation playing with
#                an English subtitle, paused, and playing again in French.
#   wait.input   the overlay again, left alone: after its 30 seconds it gives way to its `next` (wait.story).
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_visit; golden=$PWD/tests/golden/museum-visit/frames.txt
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd examples/museum-table || exit 2
fail=0
play() {  # input, frames, mode: the story on stdout, the hash of the last frame in $tmp/hash
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$d/$1" ZINC_FRAMES=$2 ZINC_FRAMEHASH=last "$ZINC" run $3 . -- --story 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" > "$tmp/hash"
}
: > "$tmp/frames"
for n in 134 200 242 412 700 880 940 1010 1150 1245 1330; do play visit.input $n --interp > /dev/null; cat "$tmp/hash" >> "$tmp/frames"; done
play visit.input 14700 --interp > "$tmp/story"
play wait.input 2100 --interp > "$tmp/wait"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/frames" "$golden"; cp "$tmp/story" "$d/expected.story"; cp "$tmp/wait" "$d/wait.story"; fi
cmp -s "$tmp/frames" "$golden" || { echo "museum_visit: frames differ from the golden"; diff "$tmp/frames" "$golden" | head -8; fail=1; }
cmp -s "$tmp/story" "$d/expected.story" || { echo "museum_visit: the story differs from expected.story"; diff "$tmp/story" "$d/expected.story" | head -8; fail=1; }
cmp -s "$tmp/wait" "$d/wait.story" || { echo "museum_visit: the story of the wait differs from wait.story"; diff "$tmp/wait" "$d/wait.story" | head -8; fail=1; }
play visit.input 200 --native > /dev/null   # the one AOT run of the museum (a headless `zinc run` interprets)
[ -s "$tmp/hash" ] && grep -qxF "$(cat "$tmp/hash")" "$golden" || { echo "museum_visit (compiled): the frame of the overlay is $(cat "$tmp/hash"), not the interpreter's"; fail=1; }
# what the criteria name: three links followed, the storyboard, a jump, a presentation played to its end, every sequence of the sample seen
for line in ' link ukiyo-e -> japonisme fade' ' link japonisme -> porcelain slide' ' link porcelain -> garden slide' ' storyboard open' ' jump japonisme -> porcelain' \
  ' presentation tour start' ' narration audio/welcome.en.mp3' ' narration audio/welcome.fr.mp3' ' presentation tour end' ' sequence wave' ' sequence garden'; do
  grep -qF -- "$line" "$d/expected.story" || { echo "museum_visit: expected.story has no \"$line\""; fail=1; }
done
[ $fail = 0 ] && echo "museum_visit: ok"
exit $fail
