#!/bin/sh
# Museum table, the storyboard editor (ZN-650.07, examples/museum-table/editor): the storyboard and the table of a sequence.
#   the document without a window (selftest.ts): 50 mixed operations from an empty project, undo then redo give back every file byte for byte
#   session.input  one scripted session, mouse and keyboard, from an empty project: three sequences named in two languages, three links, a label,
#                  a link that opens over its sequence with a slide, the start moved, a sequence moved, duplicated, deleted with the link that led
#                  to it, Save: the file equals built.json, the player's loader accepts it, and five frames equal their goldens
#   undo.input     the same, then three undos: undone.json;  redo.input: on the saved project two new sequences, two undos, then two redos
#                  (one by each key) give them back (a short run: the document's redo is proven by the self-test)
#   table.input    a second session on that project, in a folder with two media files: a photograph enters the library with its source and
#                  licence, is dragged onto the table of a sequence, moved, sized, captioned and described in two languages; a hotspot on it
#                  and a button, their targets chosen in a list and on a map; a text; a time set on the timeline: the file equals table.json,
#                  the player's loader accepts it, four frames equal their goldens
#   preview.input  the same run goes on (ZN-650.07.03): the sequence is renamed and not saved, "Play from here" puts the table's own player
#                  in the editor's window on the project as it is now; a button leads to the second sequence, its button to the third, whose
#                  link opens the first one over it with a slide, and a hotspot closes it: what the player says of the story equals
#                  preview.story, one frame equals its golden, and the file on disk is still table.json (a preview changes nothing);
#                  the table's own app (examples/museum-table) then plays that file: it opens with the sequence the session made the start
# The other sessions (the preview window, points of interest, a turned item, the settings, real pictures, French, Save as, closing) are
# tests/demo/museum_editor_views.sh: one test lasted two minutes.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/examples/museum-table; g=$PWD/tests/golden/museum-editor
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
cp "$g/built.json" "$tmp/redone.json"
edit "$tmp/redone.json" "$g/redo.input" 20
[ "$(grep -c '"id": "sequence-[12]"' "$tmp/redone.json")" = 2 ] || { echo "two new sequences, two undos, then two redos (both keys) do not give them back"; fail=1; }

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

[ $fail = 0 ] && echo "museum_editor: ok"
exit $fail
