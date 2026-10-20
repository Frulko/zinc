#!/bin/sh
# Museum table, the polish after the table mode (ZN-650.13), on the interpreter:
#   the attract loop has its own 3D views: on a project whose loop starts after 2 seconds on the sequence of the vase, a visitor turns
#     the vase and leaves (attract.input); the loop shows the vase at its opening view; a touch then finds it as the visitor turned it
#     (the view log, --log);
#   a project with four guided visits has one button for them, which opens their list (tours.input: a frame, golden/museum-polish/
#     frames.txt); every entry is within reach of the visitor's edge, and a touch on one starts that visit;
#   a subtitle lies on no control: with the narration of the vase at the four sides of the table (the session of museum_mode, whose
#     four frames are golden/museum-mode/sides.txt) and with the audio description of a print seen in full from a short side, where
#     its credit is under the picture (full.input: a frame), every line of --controls ends with over=0.
# That a point of a panorama stays under its ring at the four sides is in museum_panorama (attach.ts).
# ZN_UPDATE_GOLDEN=1 rewrites the golden from this run.
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_polish; g=$PWD/tests/golden/museum-polish; sides=$PWD/tests/data/museum_mode/sides.input
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd ../examples/museum-table || exit 2
fail=0
mkdir -p "$g" "$tmp/attract" "$tmp/tours"
for part in audio models panoramas photos video; do ln -s "$PWD/assets/$part" "$tmp/attract/$part"; ln -s "$PWD/assets/$part" "$tmp/tours/$part"; done
sed -e 's/"attractAfter": 60,/"attractAfter": 2,/' -e 's/"resetAfter": 120,/"resetAfter": 600,/' \
  -e 's/"path": \["ukiyo-e", "wave", "japonisme", "porcelain", "garden"\]/"path": ["porcelain"]/' assets/project.json > "$tmp/attract/project.json"
sed -e 's/^  "presentations": \[$/  "presentations": [ { "id": "prints", "title": { "fr": "Les estampes", "en": "The prints" }, "path": ["ukiyo-e", "wave"] }, { "id": "europe", "title": { "fr": "Le Japon vu d’Europe", "en": "Japan seen from Europe" }, "path": ["japonisme"] }, { "id": "objects", "title": { "fr": "Un vase et un jardin", "en": "A vase and a garden" }, "path": ["porcelain", "garden"] },/' \
  assets/project.json > "$tmp/tours/project.json"
play() {  # assets ('' for the sample's), input, frames, arguments of the app: what it prints in $tmp/out, the hash of the last frame added to $tmp/frames
  ZINC_ASSETS="${1:-$PWD/assets}" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$2" ZINC_FRAMES=$3 ZINC_FRAMEHASH=last "$ZINC" run --interp . -- --story $4 >"$tmp/out" 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" >> "$tmp/frames"
}
: > "$tmp/frames"

# the attract loop and the vase
play "$tmp/attract" "$d/attract.input" 280 "--log --sequence porcelain"
left=$(awk '/ attract start$/ { exit } / view yaw=/ { v = $0 } END { sub(/^[0-9]* /, "", v); print v }' "$tmp/out")
shown=$(awk '/ attract start$/ { on = 1 } on && / view yaw=/ { sub(/^[0-9]* /, ""); print; exit }' "$tmp/out")
back=$(awk '/ attract stop/ { on = 1 } on && / view yaw=/ { sub(/^[0-9]* /, ""); print; exit }' "$tmp/out")
case $left in 'view yaw=-50.00 '*) ;; *) echo "museum_polish: the visitor did not turn the vase: $left"; fail=1 ;; esac
case $shown in 'view yaw=20.00 '*) ;; *) echo "museum_polish: the attract loop does not show the vase at its opening view: $shown"; fail=1 ;; esac
[ -n "$back" ] && [ "$back" = "$left" ] || { echo "museum_polish: after the attract loop the vase is not as the visitor left it: $back / $left"; fail=1; }

# four guided visits: a list
play "$tmp/tours" "$d/tours.input" 40 "--controls"
play "$tmp/tours" "$d/tours.input" 80 "--controls"
grep -q ' presentations open$' "$tmp/out" && grep -q ' presentation europe start$' "$tmp/out" || { echo "museum_polish: the list of guided visits does not open, or does not start one: $(grep presentation "$tmp/out" | tr '\n' ' ')"; fail=1; }
reach=$(sed -n 's/.*"reach": \([0-9]*\).*/\1/p' assets/project.json)
grep ' controls .* present:prints@' "$tmp/out" | head -1 | tr ' ' '\n' | LC_ALL=C awk -F'[@,]' -v reach="$reach" '/^present:/ { n++; if (1080 - $3 > reach) { print "museum_polish: " $1 " is " 1080 - $3 " units from the visitor (reach " reach ")"; bad = 1 } }
  END { if (n != 4) { print "museum_polish: the list has " n + 0 " guided visits, not 4"; bad = 1 } exit bad }' || fail=1

# a subtitle lies on no control: the four sides, and a full view at a short side
play "" "$sides" 520 "--controls --sequence porcelain"; sed -i.bak '$d' "$tmp/frames"
grep ' controls ' "$tmp/out" > "$tmp/controls"; grep -c ' subtitle ' "$tmp/out" > "$tmp/said"
play "" "$d/full.input" 150 "--controls"
grep ' controls ' "$tmp/out" >> "$tmp/controls"
grep -q ' description kanbara-snow ' "$tmp/out" && grep -q ' subtitle Estampe en largeur' "$tmp/out" || { echo "museum_polish: no audio description in the full view at the right side"; fail=1; }
[ "$(cat "$tmp/said")" -ge 2 ] || { echo "museum_polish: no subtitle while the table turns"; fail=1; }
for side in bottom top right left; do grep -q " controls $side " "$tmp/controls" || { echo "museum_polish: no layout at the $side side"; fail=1; }; done
grep -v ' over=0$' "$tmp/controls" | head -3 | grep . && { echo "museum_polish: a subtitle lies on a control"; fail=1; }

[ -z "$ZN_UPDATE_GOLDEN" ] || cp "$tmp/frames" "$g/frames.txt"
cmp -s "$tmp/frames" "$g/frames.txt" || { echo "museum_polish: frames differ from the golden"; diff "$tmp/frames" "$g/frames.txt" | head -6; fail=1; }
[ $fail = 0 ] && echo "museum_polish: ok"
exit $fail
