#!/bin/sh
# Museum table, the storyboard editor (ZN-650.07, examples/museum-table/editor): the storyboard and the table of a sequence.
#   the document without a window (selftest.ts): 50 mixed operations from an empty project, undo then redo give back every file byte for byte
#   session.input  one scripted session, mouse and keyboard, from an empty project: three sequences named in two languages, three links, a label,
#                  a link that opens over its sequence with a slide, the start moved, a sequence moved, duplicated, deleted with the link that led
#                  to it, Save: the file equals built.json, the player's loader accepts it, and five frames equal their goldens
#   undo.input     the same, then three undos: undone.json;  redo.input: then three redos: built.json again
#   table.input    a second session on that project, in a folder with two media files: a photograph enters the library with its source and
#                  licence, is dragged onto the table of a sequence, moved, sized, captioned and described in two languages; a hotspot on it
#                  and a button, their targets chosen in a list and on a map; a text; a time set on the timeline: the file equals table.json,
#                  the player's loader accepts it, four frames equal their goldens
#   the interface in French: one frame
#   Save as goes through the system's dialog (scripted answer); closing the window with unsaved work asks, and Save saves before the app ends
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/museum-table; g=$PWD/tests/golden/museum-editor
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0

out=$("$ZINC" run "$ex/editor/selftest.ts" -- "$ex/assets/project.json" 2>&1) || fail=1
case $out in *FAILED*|*panic*|*error*) fail=1 ;; esac
for line in 'ok: 50 undos give back every earlier file, byte for byte' 'ok: 50 redos give back every later file, byte for byte' 'ok: every state on the way is a file the player accepts, in canonical form'; do
  case $out in *"$line"*) ;; *) fail=1 ;; esac
done
[ $fail = 0 ] || { echo "the document's self-test:"; printf '%s\n' "$out" | grep -v '^ok: ' | head -20; }

edit() {  # project file, input file, frames, [frames to capture], [system script]
  MUSEUM_EDITOR_LANG=${LANGUAGE_OF_EDITOR:-en} ZINC_SYSTEM_SCRIPT=${5:-} ZINC_SYSTEM_LOG="$tmp/system.log" ZINC_INPUT=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=$3 \
    ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=${4:-0} "$ZINC" run "$ex/editor" -- "$1" >"$tmp/out" 2>&1 || { echo "the editor failed on $(basename "$2"): $(head -c 300 "$tmp/out")"; fail=1; }
}
same() {  # what, file, golden
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$2" "$3"; return; fi
  cmp -s "$2" "$3" || { echo "$1: $(basename "$2") differs from $3"; diff "$2" "$3" 2>/dev/null | head -10; fail=1; }
}

edit "$tmp/built.json" "$g/session.input" 146 3,70,93,135,146
same "the session" "$tmp/built.json" "$g/built.json"
for f in 3 70 93 135 146; do
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-$f.png" "$g/frame-$f.png"; continue; fi
  tools/pngdiff "$tmp/shot-$f.png" "$g/frame-$f.png" >/dev/null || { echo "the session: frame $f differs from $g/frame-$f.png"; fail=1; }
done
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/built.json" 2>&1)
case $got in 'built.json: ok, "project" version 1, languages fr en, '*'3 sequences, 0 items, 3 links, '*', canonical') ;; *) echo "the player's loader on the saved project: $got"; fail=1 ;; esac

cat "$g/session.input" "$g/undo.input" > "$tmp/undo.input"
edit "$tmp/undone.json" "$tmp/undo.input" 160
same "three undos" "$tmp/undone.json" "$g/undone.json"
cmp -s "$tmp/undone.json" "$tmp/built.json" && { echo "three undos changed nothing"; fail=1; }
cat "$tmp/undo.input" "$g/redo.input" > "$tmp/redo.input"
edit "$tmp/redone.json" "$tmp/redo.input" 172
cmp -s "$tmp/redone.json" "$g/built.json" || { echo "three undos then three redos do not give the saved project back"; fail=1; }

# the table of a sequence: the saved project in a folder with media files
mkdir -p "$tmp/table/photos" "$tmp/table/films"
cp "$g/built.json" "$tmp/table/table.json"; printf x > "$tmp/table/photos/vague.jpg"; printf x > "$tmp/table/films/atelier.mp4"
edit "$tmp/table/table.json" "$g/table.input" 167 24,68,123,167
same "the table session" "$tmp/table/table.json" "$g/table.json"
for f in 24 68 123 167; do
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-$f.png" "$g/table-$f.png"; continue; fi
  tools/pngdiff "$tmp/shot-$f.png" "$g/table-$f.png" >/dev/null || { echo "the table session: frame $f differs from $g/table-$f.png"; fail=1; }
done
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/table/table.json" 2>&1)
case $got in 'table.json: ok, "project" version 1, languages fr en, media: 1 photo, 1 text; 3 sequences, 2 items, 5 links, '*', canonical') ;; *) echo "the player's loader on the project of the table session: $got"; fail=1 ;; esac

# the interface in French: a sequence selected on the storyboard
printf '4 move 400 300\n5 down\n6 up\n' > "$tmp/fr.input"
LANGUAGE_OF_EDITOR=fr edit "$g/built.json" "$tmp/fr.input" 10 10
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-10.png" "$g/french-10.png"; else
  tools/pngdiff "$tmp/shot-10.png" "$g/french-10.png" >/dev/null || { echo "the interface in French differs from $g/french-10.png"; fail=1; }
fi

# Save as: the path comes from the system's dialog
printf '0 dialog-answer %s\n' "$tmp/copy.json" > "$tmp/saveas.script"
printf '4 key s meta+shift\n' > "$tmp/saveas.input"
edit "$g/built.json" "$tmp/saveas.input" 10 0 "$tmp/saveas.script"
cmp -s "$tmp/copy.json" "$g/built.json" || { echo "Save as did not write the project where the dialog said"; fail=1; }
grep -q 'dialog.save' "$tmp/system.log" || { echo "Save as did not ask the system for a file"; fail=1; }

# closing with unsaved work: a new sequence (N), the window is asked to close (frame 15), Save is clicked: the file has the sequence, the app ended by itself
cp "$g/built.json" "$tmp/work.json"
printf '30 window close-requested\n' > "$tmp/close.script"
printf '4 key n\n6 key Escape\n18 move 892 500\n19 down\n20 up\n' > "$tmp/close.input"
edit "$tmp/work.json" "$tmp/close.input" 60 0 "$tmp/close.script"
grep -q '"id": "sequence-1"' "$tmp/work.json" || { echo "closing the window with unsaved work lost it"; fail=1; }

[ $fail = 0 ] && echo "museum_editor: ok"
exit $fail
