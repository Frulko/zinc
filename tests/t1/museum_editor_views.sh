#!/bin/sh
# Museum table, the storyboard editor (ZN-650.07), the sessions that start from the goldens of tests/t1/museum_editor.sh:
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
#   settings.input the settings of the project (ZN-650.07.01), on that project: the colour of what answers to a touch is typed over and the
#                  live sample beside the form follows (one frame); German is added; a guided visit is made, named in two languages, given
#                  a second step, its steps put in another order by dragging; back on the table of a sequence the panel has an empty column
#                  for the new language (one frame): the file equals settings.json, and the loader accepts it
#   a real picture in the project folder is drawn in the library and on the table (one frame); the interface in French (one frame)
#   Save as goes through the system's dialog (scripted answer); closing the window with unsaved work asks, and Save saves before the app ends
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/examples/museum-table; g=$PWD/tests/golden/museum-editor
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0


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

# the preview in a second window, which follows the edits: the project of the table session, its photograph a real picture (the Great Wave
# of the sample: a picture that no change of the editor's own look redraws)
mkdir -p "$tmp/window/photos"
cp "$g/table.json" "$tmp/window/w.json"; cp "$ex/assets/photos/great-wave.jpg" "$tmp/window/photos/vague.jpg"
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
cp "$g/table.json" "$tmp/turn/t.json"; cp "$ex/assets/photos/great-wave.jpg" "$tmp/turn/photos/vague.jpg"
edit "$tmp/turn/t.json" "$g/turn.input" 40 40
frame "an item turned on the table" 40 "$g/turn-40.png"
grep -q '{ "media": "vague", .*"rotation": 45 }' "$tmp/turn/t.json" || { echo "the handle did not turn the photograph by 45 degrees: $(grep '"media": "vague"' "$tmp/turn/t.json")"; fail=1; }

# the settings of the project: a colour and the live sample, a language more, a guided visit
mkdir -p "$tmp/settings/photos"
cp "$g/table.json" "$tmp/settings/s.json"; cp "$ex/assets/photos/great-wave.jpg" "$tmp/settings/photos/vague.jpg"
edit "$tmp/settings/s.json" "$g/settings.input" 122 48,122
same "the settings session" "$tmp/settings/s.json" "$g/settings.json"
frame "the live sample follows the colour" 48 "$g/settings-48.png"
frame "a column for the added language" 122 "$g/settings-122.png"
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/settings/s.json" 2>&1)
case $got in 's.json: ok, "project" version 1, languages fr en de, '*', 1 presentations, '*', canonical') ;; *) echo "the player's loader on the project with new settings: $got"; fail=1 ;; esac
for line in '"languages": \["fr", "en", "de"\]' '"accent": "#2f6fd0"' '"path": \["porcelaine", "estampes"\]'; do
  grep -q -- "$line" "$g/settings.json" || { echo "settings.json has no $line"; fail=1; }
done

# a picture of the project folder is shown: the first steps of the table session in a folder whose photograph is a real image (the Great
# Wave of the sample, 1280 x 860): the library row and the item on the table draw it, and the item takes its shape
mkdir -p "$tmp/pictures/photos" "$tmp/pictures/films"
cp "$g/built.json" "$tmp/pictures/p.json"; cp "$ex/assets/photos/great-wave.jpg" "$tmp/pictures/photos/vague.png"; printf x > "$tmp/pictures/films/atelier.mp4"
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

[ $fail = 0 ] && echo "museum_editor_views: ok"
exit $fail
