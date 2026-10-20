#!/bin/sh
# Museum table, accessibility (ZN-650.10): the text size and the high contrast one touch away, every control within reach, subtitles and
# audio descriptions. Scripted sessions on the sample project (tests/data/museum_access/sessions.py), on the interpreter; the player says
# what happens to the story (--story) and, each time a control moves, where every control is and how many texts did not fit where they
# are written (--controls). Each session is played to the frames named below and the last frame of each run is hashed (a hash of every
# frame of a session costs a tenth of a second per frame):
#   sizes.input   on the prints, the text size button twice, the high contrast, the text size twice more: four frames (golden/museum-access/
#                 sizes.txt: the largest text, the largest text in high contrast, the designed size in high contrast, the middle size in
#                 high contrast). The visitor leaves; after the reset of the project (120 seconds) a touch finds the table exactly as a table
#                 just started shows it after the same touch (tests/data/museum_mode/fresh.input): the settings went with the visit.
#   object.input  on the vase, the largest text in high contrast (a frame); "Next point" opens a point of interest without a touch on the
#                 object (a frame); the table turned to each side, at the largest text and at the designed one.
#   reach.input   on the panorama, "Next point" twice opens the panel of a point that leads to a sequence (a frame); each side of the table;
#                 the storyboard; a print seen in full (a frame).
#   voice.input   a print seen in full: "Audio description" says it, with its subtitles on the picture (a frame); the language button says
#                 it again in English; the button stops it, and so does closing the full view; the vase's is played to its end (a frame);
#                 the panorama's stops when the sequence is left. The clips asked for and each subtitle are in voice.story.
# Compiled, the largest text in high contrast is the same picture (one frame, one hash).
# In every line of --controls, at the four sides and three text sizes: no control lies farther than table.reach from the nearest edge, the
# buttons (all but the nodes of the storyboard and the button inside a panel, which has its twin among them) lie within it of the visitor's
# own edge, no text is cut short, and the subtitle lies on no control. tools/contrast-check passes the colours of the project and refuses a weaker high contrast. Every
# picture, object and panorama has an audio description in both languages whose clip decodes, lasts what its subtitles say and gives
# sound (heard.ts, in a run that is not deterministic: a deterministic one decodes no sound).
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
d=$PWD/tests/data/museum_access; g=$PWD/tests/golden/museum-access; fresh=$PWD/tests/data/museum_mode/fresh.input; tools=$PWD/tools
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd examples/museum-table || exit 2
fail=0
play() {  # input, frames, mode, arguments of the app: the story in $tmp/story, the controls added to $tmp/controls, the last frame's hash to $tmp/frames
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$1" ZINC_FRAMES=$2 ZINC_FRAMEHASH=last "$ZINC" run $3 . -- --story --controls $4 >"$tmp/out" 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" >> "$tmp/frames"
  grep -v '^[0-9]* controls ' "$tmp/out" > "$tmp/story"; grep '^[0-9]* controls ' "$tmp/out" >> "$tmp/controls"
}
same() {  # what, file, golden
  [ -z "$ZN_UPDATE_GOLDEN" ] || cp "$2" "$3"
  cmp -s "$2" "$3" || { echo "museum_access: $1 differs from $3"; diff "$2" "$3" | head -8; fail=1; }
}
session() {  # name, arguments of the app, frames (the last one ends the session): the frames against golden/<name>.txt, the story against <name>.story
  s=$1; args=$2; shift 2
  : > "$tmp/frames"
  for n in "$@"; do play "$d/$s.input" "$n" --interp "$args"; done
  same "the frames of $s" "$tmp/frames" "$g/$s.txt"
  same "the story of $s" "$tmp/story" "$d/$s.story"
}
mkdir -p "$g"
: > "$tmp/controls"
session sizes "" 70 110 150 190 9040
after=$(tail -1 "$tmp/frames" | cut -d' ' -f2-)
: > "$tmp/frames"; play "$fresh" 50 --interp ""
[ -n "$after" ] && [ "$after" = "$(cut -d' ' -f2- "$tmp/frames")" ] || { echo "museum_access: after the reset the table is not as new: $after / $(cat "$tmp/frames")"; fail=1; }
session object "--sequence porcelain" 100 170 450
session reach "--sequence garden" 120 480 500
session voice "" 100 500 1200
: > "$tmp/frames"; play "$d/sizes.input" 110 "" ""
[ -s "$tmp/frames" ] && grep -qxF "$(cat "$tmp/frames")" "$g/sizes.txt" || { echo "museum_access (compiled): frame 110 of sizes is $(cat "$tmp/frames"), not the interpreter's"; fail=1; }

# the layout: every control within reach, nothing cut, at four sides and three sizes
reach=$(sed -n 's/.*"reach": \([0-9]*\).*/\1/p' assets/project.json)
LC_ALL=C awk -v reach="$reach" -v W=1920 -v H=1080 '
  { side = $3; size = $5; sides[side] = 1; sizes[size] = 1
    if ($7 != 0) { printf "museum_access: frame %s, %s side, size %s: %s texts are cut short\n", $1, side, size, $7; bad = 1 }
    if ($NF != "over=0") { printf "museum_access: frame %s, %s side, size %s: the subtitle lies on a control (%s)\n", $1, side, size, $NF; bad = 1 }
    for (i = 8; i < NF; i++) {
      split($i, c, "@"); split(c[2], p, ","); x = p[1]; y = p[2]; seen[c[1]] = 1
      near = x; if (W - x < near) near = W - x; if (y < near) near = y; if (H - y < near) near = H - y
      own = side == "bottom" ? H - y : side == "top" ? y : side == "right" ? W - x : x
      if (near > reach) { printf "museum_access: frame %s, %s side, size %s: %s is %d units from the nearest edge (reach %d)\n", $1, side, size, c[1], near, reach; bad = 1 }
      if (c[1] !~ /^(node:|panel$)/ && own > reach) { printf "museum_access: frame %s, size %s: %s is %d units from the edge of the visitor at the %s side (reach %d)\n", $1, size, c[1], own, side, reach; bad = 1 }
    } }
  END { n = split("text contrast language storyboard present:tour link:porcelain light reset describe:vase next:vase describe:garden next:garden follow:garden panel node:garden full-close describe:kanbara-snow", want, " ")
    for (i = 1; i <= n; i++) if (!(want[i] in seen)) { printf "museum_access: the control %s was never laid out\n", want[i]; bad = 1 }
    n = split("bottom top right left", want, " "); for (i = 1; i <= n; i++) if (!(want[i] in sides)) { printf "museum_access: no layout at the %s side\n", want[i]; bad = 1 }
    n = split("1 1.3 1.6", want, " "); for (i = 1; i <= n; i++) if (!(want[i] in sizes)) { printf "museum_access: no layout at the text size %s\n", want[i]; bad = 1 }
    exit bad }' "$tmp/controls" || fail=1
# what the criteria name
for line in ' text size 1.6' ' contrast on' ' visit end' ' reset: sequence ukiyo-e, language fr, side bottom, 0 seen'; do
  grep -qF -- "$line" "$d/sizes.story" || { echo "museum_access: sizes.story has no \"$line\""; fail=1; }
done
for line in ' description kanbara-snow audio/descriptions/kanbara-snow.fr.mp3' ' subtitle Estampe en largeur, presque sans couleur.' ' description kanbara-snow audio/descriptions/kanbara-snow.en.mp3' \
  ' description stop' ' description vase audio/descriptions/vase.en.mp3' ' description end' ' description garden audio/descriptions/garden.en.mp3'; do
  grep -qF -- "$line" "$d/voice.story" || { echo "museum_access: voice.story has no \"$line\""; fail=1; }
done
grep -qF ' point lady of vase' "$d/object.story" && grep -qF ' point steps of garden' "$d/reach.story" || { echo "museum_access: \"Next point\" does not open the points of interest"; fail=1; }

# the colours: the project's pass, a high contrast with grey secondary texts does not
out=$(python3 "$tools/contrast-check" --museum assets/project.json) || { echo "museum_access: the colours of the sample are too weak:"; printf '%s\n' "$out" | grep FAIL; fail=1; }
[ "$(printf '%s\n' "$out" | grep -c '^highContrast .* ok$')" = 6 ] || { echo "museum_access: contrast-check did not judge the six pairs of the high contrast: $out"; fail=1; }
sed 's/"muted": "#e0e0e0"/"muted": "#777777"/' assets/project.json > "$tmp/weak.json"
out=$(python3 "$tools/contrast-check" --museum "$tmp/weak.json") && { echo "museum_access: contrast-check accepts grey on black as a high contrast"; fail=1; }
printf '%s\n' "$out" | grep -q '^highContrast muted .*FAIL' || { echo "museum_access: contrast-check does not name the weak pair: $out"; fail=1; }

# the voice: every description is there in both languages, and its clip is heard
out=$(ZINC_HEADLESS=1 env -u ZINC_DETERMINISTIC "$ZINC" run "$d/heard.ts" -- "$PWD/assets" 2>&1) || fail=1
case $out in *'28 audio descriptions, all heard') ;; *) echo "museum_access: the audio descriptions:"; printf '%s\n' "$out" | grep -v 'peak heard$' | head -10; fail=1 ;; esac
[ $fail = 0 ] && echo "museum_access: ok"
exit $fail
