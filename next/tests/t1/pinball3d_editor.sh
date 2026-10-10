#!/bin/sh
# The table editor of the 3D pinball (ZN-649.04, examples/pinball3d-editor). Slice 1: a table folder opened, the top view, the
# properties generated from the format's schema, undo and redo, save. Slice 2: drawing (paths, arcs, snapping, mirror), ramps with
# their height profile, the palette, the plunger lane, duplicate.
# The format grows while the editor is written, and its forms and its list are generated from it, so nothing here depends on how many
# fields or lists the format has:
# - the sessions run on a table kept with the test (table.json, Tidal Lock of 2026-10-10); they reach a field by its key (Cmd+F, the
#   box that finds a field), a thing by its path and an entry of the palette by its key (Cmd+G) and the text of the selection by
#   Cmd+J, never by the place of a line;
# - a frame is the golden's bytes, or else the same picture in the part of the window that does not come from the schema (the top
#   view and the heights beside it: CROP); the generated form has its pixels on a schema kept in the editor (src/formcheck.tsx);
# - what the forms of the real format do is checked by the files they write.
#   the document without a window (src/selftest.ts): 50 mixed operations, undo then redo give back every file byte for byte; a renamed
#                    thing is renamed where it is named; a deleted one takes what cannot do without it; the roles of the format
#   untouched        the test's table, and the table the game ships today, opened and saved: the same bytes; the same table written
#                    another way (on one line) saves to the canonical bytes
#   edit.input       a bumper dragged, a flipper's strength typed in the form, a wall's surface chosen in the list of the table's
#                    surfaces, Save: the file equals edited.json, the game's loader accepts it, four frames
#   view.input       wheel zoom, pan, a flipper turned with its handle, a light deleted with the rule's name of it, undo, undo, redo,
#                    nudges with the arrows, Save: viewed.json, four frames
#   advanced.input   a value outside the format's limits is refused with the loader's message; a surface reached by its path and edited
#                    as the file has it: advanced.json, two frames
#   draw.input       a wall drawn point by point, a point moved, a stretch bent into an arc, a point added and one taken away, the
#                    wall mirrored about the table's axis, a ramp drawn and its height profile shaped, a bumper placed and
#                    duplicated, Save: drawn.json, five frames
#   lane.input       on a new table: the plunger lane in one step, the axis moved, a left flipper and its mirror image: lane.json
#   the form on the schema of formcheck.tsx, in English and in French (two frames); a new table is saved in the folder the system's
#   dialog gives
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/pinball3d-editor; g=$PWD/tests/golden/pinball3d-editor
game=$PWD/../examples/pinball3d
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# the top view and the heights, in a window of 1440 x 900: x, y, width, height
CROP=386,48,714,820

out=$("$ZINC" run "$ex/src/selftest.ts" -- "$g/table.json" 2>&1) || fail=1
case $out in *FAILED*|*panic*|*error*) fail=1 ;; esac
for line in 'ok: the sample table opened and saved untouched is byte-identical' 'ok: 50 undos give back every earlier file, byte for byte' 'ok: 50 redos give back every later file, byte for byte' \
  'ok: every state on the way is a file the game accepts, in canonical form' 'ok: every text of the interface exists in English and in French' 'ok: a field is found by its key, alone' \
  'ok: the palette has an entry for every kind the format places, and each makes a thing the game accepts' 'ok: the mirror image of a left flipper is a right flipper'; do
  case $out in *"$line"*) ;; *) fail=1 ;; esac
done
[ $fail = 0 ] || { echo "the document's self-test:"; printf '%s\n' "$out" | grep -v '^ok: ' | head -20; }

edit() {  # table folder, input file, frames, [frames to capture], [system script]
  PINBALL_EDITOR_LANG=${LANGUAGE_OF_EDITOR:-en} ZINC_SYSTEM_SCRIPT=${5:-} ZINC_SYSTEM_LOG="$tmp/system.log" ZINC_INPUT=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=$3 \
    ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=${4:-0} "$ZINC" run "$ex" -- "$1" >"$tmp/out" 2>&1 || { echo "the editor failed on $(basename "$2"): $(head -c 300 "$tmp/out")"; fail=1; }
}
fresh() {  # name: a folder with the test's table
  mkdir -p "$tmp/$1"; cp "$g/table.json" "$tmp/$1/table.json"
}
same() {  # what, file, golden
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$2" "$3"; return; fi
  cmp -s "$2" "$3" || { echo "$1: $(basename "$2") differs from $3"; diff "$2" "$3" 2>/dev/null | head -10; fail=1; }
}
frames() {  # what, prefix of the goldens, part of the window to compare ('' for all of it), frames...
  what=$1; prefix=$2; part=$3; shift 3
  for f in "$@"; do
    if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-$f.png" "$g/$prefix-$f.png"; continue; fi
    # the same bytes are the same picture; a file that differs is decoded and compared pixel by pixel (3 s a frame), in `part` only
    cmp -s "$tmp/shot-$f.png" "$g/$prefix-$f.png" || tools/pngdiff "$tmp/shot-$f.png" "$g/$prefix-$f.png" ${part:+--crop $part} >/dev/null || { echo "$what: frame $f differs from $g/$prefix-$f.png"; fail=1; }
  done
}
accepted() {  # what, table folder: the game's loader takes it, and it is in the form the game writes
  got=$("$ZINC" run "$game/tools/table.ts" -- check "$2" 2>&1)
  case $got in *'is a valid table (version 1)'*) ;; *) echo "$1: the game's loader refuses the saved table: $(printf '%s' "$got" | head -c 300)"; fail=1 ;; esac
  "$ZINC" run "$game/tools/table.ts" -- print "$2" 2>/dev/null | cmp -s - "$2/table.json" || { echo "$1: the saved table is not in the canonical form"; fail=1; }
}

# opened and saved untouched: the same bytes
printf '4 key s meta\n' > "$tmp/save.input"
fresh untouched
edit "$tmp/untouched" "$tmp/save.input" 8
cmp -s "$tmp/untouched/table.json" "$g/table.json" || { echo "the test's table opened and saved untouched is not byte-identical"; fail=1; }
mkdir -p "$tmp/live"; cp "$game/assets/tables/tidal-lock/table.json" "$tmp/live/table.json"
edit "$tmp/live" "$tmp/save.input" 8
cmp -s "$tmp/live/table.json" "$game/assets/tables/tidal-lock/table.json" || { echo "the game's Tidal Lock opened and saved untouched is not byte-identical"; fail=1; }
# the same table on one line is not what the editor writes: Save rewrites it in the canonical form
mkdir -p "$tmp/oneline"; tr -d '\n' < "$g/table.json" > "$tmp/oneline/table.json"
edit "$tmp/oneline" "$tmp/save.input" 8
cmp -s "$tmp/oneline/table.json" "$g/table.json" || { echo "a table written another way is not saved in the canonical form"; fail=1; }

fresh edit
edit "$tmp/edit" "$g/edit.input" 40 7,21,32,38
same "the editing session" "$tmp/edit/table.json" "$g/edited.json"
frames "the editing session" edit $CROP 7 21 32 38
accepted "the editing session" "$tmp/edit"
cmp -s "$tmp/edit/table.json" "$g/table.json" && { echo "the editing session changed nothing"; fail=1; }

fresh view
edit "$tmp/view" "$g/view.input" 48 16,24,32,47
same "the view session" "$tmp/view/table.json" "$g/viewed.json"
frames "the view session" view $CROP 16 24 32 47
accepted "the view session" "$tmp/view"

fresh advanced
edit "$tmp/advanced" "$g/advanced.input" 36 14,26
same "the advanced session" "$tmp/advanced/table.json" "$g/advanced.json"
frames "the advanced session" advanced $CROP 14 26
accepted "the advanced session" "$tmp/advanced"
cmp -s "$tmp/advanced/table.json" "$g/table.json" && { echo "the advanced session changed nothing"; fail=1; }

fresh draw
edit "$tmp/draw" "$g/draw.input" 96 13,30,46,66,95
same "the drawing session" "$tmp/draw/table.json" "$g/drawn.json"
frames "the drawing session" draw $CROP 13 30 46 66 95
accepted "the drawing session" "$tmp/draw"

# a folder that has no table yet: a new one, saved there
edit "$tmp/lane" "$g/lane.input" 30 23,29
same "the plunger lane on a new table" "$tmp/lane/table.json" "$g/lane.json"
frames "the plunger lane on a new table" lane $CROP 23 29
accepted "the plunger lane on a new table" "$tmp/lane"

# the generated form, on the schema the editor keeps for this: a field of every kind, with the help of the one the pointer is over;
# then the same in French, the pointer on another line
form() {  # language, input file
  PINBALL_EDITOR_LANG=$1 ZINC_INPUT=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=340x780 ZINC_FRAMES=8 ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=8 \
    "$ZINC" run "$ex/src/formcheck.tsx" >"$tmp/out" 2>&1 || { echo "the form on its own schema failed: $(head -c 300 "$tmp/out")"; fail=1; }
}
printf '4 move 150 100\n' > "$tmp/form.input"
form en "$tmp/form.input"
frames "the generated form" form '' 8
cp "$tmp/shot-8.png" "$tmp/form-en.png"
printf '4 move 150 290\n' > "$tmp/form-fr.input"
form fr "$tmp/form-fr.input"
frames "the generated form in French" form-fr '' 8
# the two differ by their words and by the line the pointer is on: the comparison of a part of a picture sees it there, and nowhere else
tools/pngdiff "$tmp/form-en.png" "$tmp/shot-8.png" --crop 0,30,340,120 >/dev/null && { echo "the English and the French form are the same picture"; fail=1; }
tools/pngdiff "$tmp/form-en.png" "$tmp/shot-8.png" --crop 136,10,160,60 >/dev/null || { echo "pngdiff --crop: two fields that hold the same values differ"; fail=1; }

# a new table: Save asks the system for its folder, and the file written there is one the game plays
mkdir -p "$tmp/new"
printf '0 dialog-answer %s\n' "$tmp/new" > "$tmp/new.script"
printf '4 key n meta\n8 key s meta\n' > "$tmp/new.input"
edit "$tmp/untouched" "$tmp/new.input" 14 0 "$tmp/new.script"
grep -q 'dialog.open' "$tmp/system.log" || { echo "Save on a new table did not ask the system for a folder"; fail=1; }
[ -f "$tmp/new/table.json" ] && accepted "a new table" "$tmp/new" || { echo "a new table was not saved where the dialog said"; fail=1; }

[ $fail = 0 ] && echo "pinball3d_editor: ok"
exit $fail
