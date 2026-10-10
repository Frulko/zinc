#!/bin/sh
# The table editor of the 3D pinball (ZN-649.04, examples/pinball3d-editor), slice 1: a table folder opened, the top view, the
# properties generated from the format's schema, undo and redo, save. The sessions run on a table kept with the test (table.json, Tidal
# Lock as it was when the editor was written), so that the game's table can change without moving these goldens.
#   the document without a window (src/selftest.ts): 50 mixed operations, undo then redo give back every file byte for byte; a renamed
#                    thing is renamed where it is named; a deleted one takes what cannot do without it
#   untouched        the test's table, and the table the game ships today, opened and saved: the same bytes; the same table written
#                    another way (on one line) saves to the canonical bytes
#   edit.input       a bumper dragged, a flipper's strength typed in the form, a wall's surface chosen in the list of the table's
#                    surfaces, Save: the file equals edited.json, the game's loader accepts it, four frames equal their goldens
#   view.input       wheel zoom, pan, a flipper turned with its handle, a light deleted with the rule's name of it, undo, undo, redo,
#                    nudges with the arrows, Save: viewed.json, four frames
#   advanced.input   a value outside the format's limits is refused with the loader's message; in the advanced mode the selection
#                    is edited as the file has it: advanced.json, two frames
#   the interface in French (one frame); a new table is saved in the folder the system's dialog gives
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/pinball3d-editor; g=$PWD/tests/golden/pinball3d-editor
game=$PWD/../examples/pinball3d
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0

out=$("$ZINC" run "$ex/src/selftest.ts" -- "$g/table.json" 2>&1) || fail=1
case $out in *FAILED*|*panic*|*error*) fail=1 ;; esac
for line in 'ok: the sample table opened and saved untouched is byte-identical' 'ok: 50 undos give back every earlier file, byte for byte' 'ok: 50 redos give back every later file, byte for byte' \
  'ok: every state on the way is a file the game accepts, in canonical form' 'ok: every text of the interface exists in English and in French'; do
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
frames() {  # what, prefix of the goldens, frames...
  what=$1; prefix=$2; shift 2
  for f in "$@"; do
    if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-$f.png" "$g/$prefix-$f.png"; continue; fi
    # the same bytes are the same picture; only a file that differs is decoded and compared pixel by pixel (3 s a frame)
    cmp -s "$tmp/shot-$f.png" "$g/$prefix-$f.png" || tools/pngdiff "$tmp/shot-$f.png" "$g/$prefix-$f.png" >/dev/null || { echo "$what: frame $f differs from $g/$prefix-$f.png"; fail=1; }
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
edit "$tmp/edit" "$g/edit.input" 40 7,21,30,38
same "the editing session" "$tmp/edit/table.json" "$g/edited.json"
frames "the editing session" edit 7 21 30 38
accepted "the editing session" "$tmp/edit"
cmp -s "$tmp/edit/table.json" "$g/table.json" && { echo "the editing session changed nothing"; fail=1; }

fresh view
edit "$tmp/view" "$g/view.input" 48 16,24,32,47
same "the view session" "$tmp/view/table.json" "$g/viewed.json"
frames "the view session" view 16 24 32 47
accepted "the view session" "$tmp/view"

fresh advanced
edit "$tmp/advanced" "$g/advanced.input" 40 14,32
same "the advanced session" "$tmp/advanced/table.json" "$g/advanced.json"
frames "the advanced session" advanced 14 32
accepted "the advanced session" "$tmp/advanced"

# the interface in French: a target selected on the table
fresh french
printf '4 move 446 440\n5 down\n6 up\n8 move 1200 446\n' > "$tmp/fr.input"
LANGUAGE_OF_EDITOR=fr edit "$tmp/french" "$tmp/fr.input" 12 12
frames "the interface in French" french 12

# a new table: Save asks the system for its folder, and the file written there is one the game plays
mkdir -p "$tmp/new"
printf '0 dialog-answer %s\n' "$tmp/new" > "$tmp/new.script"
printf '4 key n meta\n8 key s meta\n' > "$tmp/new.input"
edit "$tmp/untouched" "$tmp/new.input" 14 0 "$tmp/new.script"
grep -q 'dialog.open' "$tmp/system.log" || { echo "Save on a new table did not ask the system for a folder"; fail=1; }
[ -f "$tmp/new/table.json" ] && accepted "a new table" "$tmp/new" || { echo "a new table was not saved where the dialog said"; fail=1; }

[ $fail = 0 ] && echo "pinball3d_editor: ok"
exit $fail
