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
#   preview.input  the same run goes on (ZN-650.07.03): the sequence is renamed and not saved, "Play from here" puts the table's own player
#                  in the editor's window on the project as it is now; a button leads to the second sequence, its button to the third, whose
#                  link opens the first one over it with a slide, and a hotspot closes it: what the player says of the story equals
#                  preview.story, one frame equals its golden, and the file on disk is still table.json (a preview changes nothing);
#                  the table's own app (examples/museum-table) then plays that file: it opens with the sequence the session made the start
#   window.input   the preview in a second window, on that project with a real picture: it shows the sequence being edited, shows it again
#                  after the photograph is dragged on the table, takes its own clicks (a link followed there), and comes back to the
#                  sequence being edited after an undo: window.story, and the frames of both windows equal their goldens
#   points.input   points of interest (ZN-650.07.02), on that project in a folder that also holds the sample's vase and panorama: the model
#                  enters the library with its texture and goes on a table; turned, a click on it places a point, named and described in
#                  two languages, given the view it opens with ("use this view") and a sequence to lead to; the panorama the same way, a
#                  point on what a click shows: the file equals points.json (three sequences built from nothing, with media, texts in two
#                  languages, links and points of interest), the loader accepts it, two frames equal their goldens, and each point is
#                  drawn by the table's own view where it was clicked (--log)
#   turn.input     the photograph, a real picture, is turned 45 degrees by the handle above it and drawn turned, with its hotspot (one frame)
#   a real picture in the project folder is drawn in the library and on the table (one frame); the interface in French (one frame)
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

edit() {  # project file, input file, frames, [frames to capture], [system script], [another argument of the editor]
  MUSEUM_EDITOR_LANG=${LANGUAGE_OF_EDITOR:-en} ZINC_SYSTEM_SCRIPT=${5:-} ZINC_SYSTEM_LOG="$tmp/system.log" ZINC_INPUT=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=$3 \
    ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=${4:-0} "$ZINC" run "$ex/editor" -- "$1" --story ${6:-} >"$tmp/out" 2>&1 || { echo "the editor failed on $(basename "$2"): $(head -c 300 "$tmp/out")"; fail=1; }
}
frame() {  # what, frame of this run (shot-N.png or shot-N-w1.png), golden
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-$2.png" "$3"; return; fi
  tools/pngdiff "$tmp/shot-$2.png" "$3" >/dev/null || { echo "$1: frame $2 differs from $3"; fail=1; }
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

# the table of a sequence: the saved project in a folder with media files; then, in the same run, the preview of what was built
mkdir -p "$tmp/table/photos" "$tmp/table/films"
cp "$g/built.json" "$tmp/table/table.json"; printf x > "$tmp/table/photos/vague.jpg"; printf x > "$tmp/table/films/atelier.mp4"
cat "$g/table.input" "$g/preview.input" > "$tmp/preview.input"
edit "$tmp/table/table.json" "$tmp/preview.input" 390 24,68,123,167,320
same "the table session, and the preview after it" "$tmp/table/table.json" "$g/table.json"
for f in 24 68 123 167; do frame "the table session" $f "$g/table-$f.png"; done
frame "the preview" 320 "$g/preview-320.png"
grep -E '^[0-9]+ ' "$tmp/out" > "$tmp/preview.story"
same "the story of the preview" "$tmp/preview.story" "$g/preview.story"
for line in '0 sequence accueil-du-soir' ' link accueil-du-soir -> estampes fade' ' overlay porcelaine -> accueil-du-soir slide'; do
  grep -qF -- "$line" "$g/preview.story" || { echo "preview.story has no \"$line\""; fail=1; }
done
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/table/table.json" 2>&1)
case $got in 'table.json: ok, "project" version 1, languages fr en, media: 1 photo, 1 text; 3 sequences, 2 items, 5 links, '*', canonical') ;; *) echo "the player's loader on the project of the table session: $got"; fail=1 ;; esac
# and the table's own app plays the saved file: the folder of the project is its assets
cp "$tmp/table/table.json" "$tmp/table/project.json"
got=$(ZINC_ASSETS="$tmp/table" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_FRAMES=3 "$ZINC" run "$ex" -- --story 2>&1)
[ "$got" = '0 sequence estampes' ] || { echo "the table's app on the saved project: $got"; fail=1; }

# the preview in a second window, which follows the edits: the project of the table session, its photograph a real picture (a frame of this test)
mkdir -p "$tmp/window/photos"
cp "$g/table.json" "$tmp/window/w.json"; cp "$g/frame-3.png" "$tmp/window/photos/vague.jpg"
edit "$tmp/window/w.json" "$g/window.input" 165 90
frame "the preview window: the editor" 90 "$g/window-90.png"
frame "the preview window" 90-w1 "$g/window-90-w1.png"
grep -E '^[0-9]+ ' "$tmp/out" > "$tmp/window.story"
same "the story of the preview window" "$tmp/window.story" "$g/window.story"
[ "$(grep -c '^0 sequence accueil$' "$g/window.story")" = 3 ] || { echo "the preview window did not show the sequence being edited three times (opened, after the edit, after the undo)"; fail=1; }

# points of interest on the sample's vase and in its panorama, added to the project of the table session
mkdir -p "$tmp/points/photos" "$tmp/points/films"
cp "$g/table.json" "$tmp/points/points.json"; printf x > "$tmp/points/photos/vague.jpg"; printf x > "$tmp/points/films/atelier.mp4"
cp -R "$ex/assets/models" "$ex/assets/panoramas" "$tmp/points/"
edit "$tmp/points/points.json" "$g/points.input" 194 103,176 "" --log
same "the points session" "$tmp/points/points.json" "$g/points.json"
frame "a point on the vase" 103 "$g/points-103.png"
frame "a point in the panorama" 176 "$g/points-176.png"
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/points/points.json" 2>&1)
case $got in 'points.json: ok, "project" version 1, languages fr en, media: 1 photo, 1 text, 1 model, 1 panorama; 3 sequences, 4 items, 5 links, 2 points, '*', canonical') ;; *) echo "the player's loader on the project with points of interest: $got"; fail=1 ;; esac
# "point <medium>/<id> at x y z clicked sx sy drawn px py": the place the file keeps is drawn by the view within a pixel and a half of the click
grep '^point ' "$tmp/out" > "$tmp/points.log"
awk '{ n++; dx = $8 - $11; dy = $9 - $12; if (dx < 0) dx = -dx; if (dy < 0) dy = -dy; if (dx > 1.5 || dy > 1.5 || NF != 12) bad = 1 } END { exit !(n == 2 && !bad) }' "$tmp/points.log" ||
  { echo "the points are not drawn where they were clicked: $(tr '\n' '|' < "$tmp/points.log")"; fail=1; }
grep -q '^point vase/' "$tmp/points.log" && grep -q '^point ninomaru/' "$tmp/points.log" || { echo "no point on the vase or in the panorama: $(tr '\n' '|' < "$tmp/points.log")"; fail=1; }

# an item is turned on the table by its handle and drawn turned
mkdir -p "$tmp/turn/photos"
cp "$g/table.json" "$tmp/turn/t.json"; cp "$g/frame-3.png" "$tmp/turn/photos/vague.jpg"
edit "$tmp/turn/t.json" "$g/turn.input" 40 40
frame "an item turned on the table" 40 "$g/turn-40.png"
grep -q '{ "media": "vague", .*"rotation": 45 }' "$tmp/turn/t.json" || { echo "the handle did not turn the photograph by 45 degrees: $(grep '"media": "vague"' "$tmp/turn/t.json")"; fail=1; }

# a picture of the project folder is shown: the first steps of the table session in a folder whose photograph is a real image (a frame of
# this test, 1440 x 900): the library row and the item on the table draw it, and the item takes its shape
mkdir -p "$tmp/pictures/photos" "$tmp/pictures/films"
cp "$g/built.json" "$tmp/pictures/p.json"; cp "$g/frame-3.png" "$tmp/pictures/photos/vague.png"; printf x > "$tmp/pictures/films/atelier.mp4"
awk '$1 ~ /^[0-9]+$/ && $1 <= 64' "$g/table.input" > "$tmp/pictures.input"
edit "$tmp/pictures/p.json" "$tmp/pictures.input" 68 68
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-68.png" "$g/pictures-68.png"; else
  tools/pngdiff "$tmp/shot-68.png" "$g/pictures-68.png" >/dev/null || { echo "a picture of the project folder: frame 68 differs from $g/pictures-68.png"; fail=1; }
fi

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
