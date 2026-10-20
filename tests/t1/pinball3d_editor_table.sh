#!/bin/sh
# The table editor of the 3D pinball, a whole table (ZN-649.04 slice 5, criteria 1 and 2; ZN-649.06 criterion 1): what the editor
# makes is a table the game plays. (The editor's views and forms are in pinball3d_editor.sh; the sessions here reach things the same
# way: by name, by key, on the top view, never by the place of a line.)
#   new.input   a table made from nothing in a folder that has none: its walls with an arch, the plunger lane, two flippers by
#               mirror, three bumpers, a bank of targets, a sound, two rules and a mission, Save, Export. The file equals new.json and
#               the game's loader accepts it; two frames; the game plays its own scripted game on it and scores (bumpers, targets,
#               the mission done); the exported package plays the same game, event for event.
#   the game's own table, with its sounds, images and models, exported by the editor as one file: the first twenty seconds of the
#   scripted game played from that package are the log the game's own test keeps for the folder. A table whose folder lacks a file
#   it names is not exported, and the refusal names the file.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/examples/pinball3d-editor; g=$PWD/tests/golden/pinball3d-editor
game=$PWD/examples/pinball3d
play=$PWD/tests/data/pinball3d/play.input
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# the top view and the heights, in a window of 1440 x 900: x, y, width, height
CROP=386,48,714,820

edit() {  # table folder, input file, frames, frames to capture, system script: the editor's --log on $tmp/out
  PINBALL_EDITOR_LANG=en ZINC_SYSTEM_SCRIPT=$5 ZINC_INPUT=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=$3 \
    ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=$4 "$ZINC" run "$ex" -- "$1" --log >"$tmp/out" 2>"$tmp/err" || { echo "the editor failed on $(basename "$2"): $(head -c 300 "$tmp/err")"; fail=1; }
}
game_on() {  # table (a folder or a package), frames: the game's scripted game on it, its event log on the output
  ZINC_INPUT="$play" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=$2 "$ZINC" run "$game" -- "--table=$1" --log 2>/dev/null
}

# a table made from nothing
printf '0 dialog-answer %s\n' "$tmp/starter.zpinball" > "$tmp/export.script"
edit "$tmp/made" "$g/new.input" 198 119,196 "$tmp/export.script"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/made/table.json" "$g/new.json"; for f in 119 196; do cp "$tmp/shot-$f.png" "$g/new-$f.png"; done; fi
cmp -s "$tmp/made/table.json" "$g/new.json" || { echo "a table made from nothing: table.json differs from $g/new.json"; diff "$tmp/made/table.json" "$g/new.json" 2>/dev/null | head -10; fail=1; }
for f in 119 196; do
  # the same bytes are the same picture; a file that differs is decoded and compared in the top view and the heights only
  cmp -s "$tmp/shot-$f.png" "$g/new-$f.png" || tools/pngdiff "$tmp/shot-$f.png" "$g/new-$f.png" --crop $CROP >/dev/null || { echo "a table made from nothing: frame $f differs from $g/new-$f.png"; fail=1; }
done
got=$("$ZINC" run "$game/tools/table.ts" -- check "$tmp/made" 2>&1)
case $got in *'"Starter" is a valid table (version 1)'*) ;; *) echo "the game's loader refuses the table made in the editor: $(printf '%s' "$got" | head -c 300)"; fail=1 ;; esac
"$ZINC" run "$game/tools/table.ts" -- print "$tmp/made" 2>/dev/null | cmp -s - "$tmp/made/table.json" || { echo "the table made in the editor is not in the canonical form"; fail=1; }
game_on "$tmp/made" 900 > "$tmp/made.log"
[ "$(grep -c ' hit +' "$tmp/made.log")" -ge 5 ] && grep -q ' game missionDone' "$tmp/made.log" || { echo "the game does not score on the table made in the editor: $(grep -v ' flip$' "$tmp/made.log" | head -6 | tr '\n' ';')"; fail=1; }
[ -f "$tmp/starter.zpinball" ] || { echo "Export did not write the package where the dialog said"; fail=1; }
game_on "$tmp/starter.zpinball" 900 | cmp -s - "$tmp/made.log" || { echo "the package of the table made in the editor does not play the game its folder plays"; fail=1; }

# the game's own table as one file
cp -R "$game/assets/tables/tidal-lock" "$tmp/tidal"
printf '0 dialog-answer %s\n' "$tmp/tidal.zpinball" > "$tmp/tidal.script"
printf '4 key e meta+shift\n' > "$tmp/export.input"
edit "$tmp/tidal" "$tmp/export.input" 10 0 "$tmp/tidal.script"
[ -f "$tmp/tidal.zpinball" ] && [ "$(head -c 4 "$tmp/tidal.zpinball")" = ZPK1 ] || { echo "the game's table was not exported with its files"; fail=1; }
game_on "$tmp/tidal.zpinball" 1200 > "$tmp/tidal.log"
n=$(wc -l < "$tmp/tidal.log" | tr -d ' ')
[ "$n" -ge 40 ] && head -n "$n" "$PWD/tests/data/pinball3d/play.log" | cmp -s - "$tmp/tidal.log" || { echo "the game's table played from the package the editor made does not print tests/data/pinball3d/play.log ($n lines)"; fail=1; }
# the package opened in the editor (ZN-649.16): checked, unpacked into a new folder beside it (never over the folder that is
# there), and Save as writes the table and its files in another folder
printf '4 key s meta+shift\n' > "$tmp/saveas.input"
printf '0 dialog-answer %s\n' "$tmp/copy" > "$tmp/saveas.script"
edit "$tmp/tidal.zpinball" "$tmp/saveas.input" 10 0 "$tmp/saveas.script"
for d in "tidal 2" copy; do
  cmp -s "$tmp/$d/table.json" "$tmp/tidal/table.json" && [ "$(ls "$tmp/$d/sounds" | wc -l)" = "$(ls "$tmp/tidal/sounds" | wc -l)" ] && cmp -s "$tmp/$d/sounds/$(ls "$tmp/tidal/sounds" | head -1)" "$tmp/tidal/sounds/$(ls "$tmp/tidal/sounds" | head -1)" \
    || { echo "the folder '$d' (a package opened, then Save as) is not the table and its files"; fail=1; }
done
# a package altered after it was exported is refused by the name of the file, and nothing is unpacked
python3 - "$tmp/tidal.zpinball" "$tmp/bad.zpinball" <<'PY'
import sys
b = bytearray(open(sys.argv[1], 'rb').read())
b[-100] ^= 0xff
open(sys.argv[2], 'wb').write(b)
PY
: > "$tmp/none.input"
edit "$tmp/bad.zpinball" "$tmp/none.input" 4 0 "$tmp/saveas.script"
grep -q 'Cannot open bad.zpinball: the file "[^"]*" was altered after the package was made' "$tmp/out" || { echo "an altered package is not refused by the name of its file: $(head -c 300 "$tmp/out")"; fail=1; }
[ -e "$tmp/bad" ] && { echo "an altered package was unpacked"; fail=1; }
gone=$(ls "$tmp/tidal/sounds" | head -1)
rm "$tmp/tidal/sounds/$gone" "$tmp/tidal.zpinball"
edit "$tmp/tidal" "$tmp/export.input" 10 0 "$tmp/tidal.script"
grep -q "sounds/$gone" "$tmp/out" || { echo "exporting a table whose folder lacks sounds/$gone does not name the file: $(head -c 200 "$tmp/out")"; fail=1; }
[ -f "$tmp/tidal.zpinball" ] && { echo "a package was made of a table whose folder lacks a file it names"; fail=1; }

[ $fail = 0 ] && echo "pinball3d_editor_table: ok"
exit $fail
