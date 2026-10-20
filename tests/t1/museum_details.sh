#!/bin/sh
# Museum table, details of the editor (ZN-650.07.06): one scripted session (tests/data/museum_details/details.input) on a project in a folder
# with a real photograph, the sample's vase and its panorama (start.json: the project of museum_editor's points session, its photograph
# turned by 30 degrees, every text in French and in English).
#   the miniature of a sequence on the storyboard draws the photograph turned (frame 56), and the library shows the vase drawn by the
#   table's own viewer, not its texture atlas (frame 80)
#   in the settings German is added; it cannot be the default language (the project has no title in it: nothing changes), English can
#   a new sequence is named in each language's own word (Sequence, Séquence, Sequenz) and left empty in a language the editor has no word
#   in (ja): the saved file equals details.json, and the player's loader accepts it with English first
# The document's own checks of these are in editor/selftest.ts (museum_editor runs it). ZN_UPDATE_GOLDEN=1 rewrites the goldens.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/museum-table; d=$PWD/tests/data/museum_details; g=$PWD/tests/golden/museum-details
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/p/photos" "$tmp/p/films" "$g"
cp "$d/start.json" "$tmp/p/p.json"; cp "$ex/assets/photos/great-wave.jpg" "$tmp/p/photos/vague.jpg"; printf x > "$tmp/p/films/atelier.mp4"
cp -R "$ex/assets/models" "$ex/assets/panoramas" "$tmp/p/"
MUSEUM_EDITOR_LANG=en ZINC_INPUT="$d/details.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=80 ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=56,80 \
  "$ZINC" run "$ex/editor" -- "$tmp/p/p.json" > "$tmp/out" 2>&1 || { echo "museum_details: the editor failed: $(head -c 300 "$tmp/out")"; fail=1; }
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/p/p.json" "$g/details.json"; cp "$tmp/shot-56.png" "$g/details-56.png"; cp "$tmp/shot-80.png" "$g/details-80.png"; fi
cmp -s "$tmp/p/p.json" "$g/details.json" || { echo "museum_details: the saved file differs from details.json"; diff "$tmp/p/p.json" "$g/details.json" | head -10; fail=1; }
for f in 56 80; do
  tools/pngdiff "$tmp/shot-$f.png" "$g/details-$f.png" > /dev/null 2>&1 || { echo "museum_details: frame $f differs from $g/details-$f.png"; fail=1; }
done
grep -q '"languages": \["en", "fr", "de", "ja"\]' "$g/details.json" || { echo "museum_details: English is not the default language of details.json"; fail=1; }
tr -d '\n' < "$g/details.json" | grep -q '"id": "sequence-1", *"title": { *"en": "Sequence 1", *"fr": "Séquence 1", *"de": "Sequenz 1" *}' ||
  { echo "museum_details: the new sequence is not named in each language's word, or has a name in ja"; fail=1; }
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/p/p.json" 2>&1)
case $got in 'p.json: ok, "project" version 1, languages en fr de ja, '*'4 sequences, '*', canonical'*) ;; *) echo "museum_details: the player's loader on the saved project: $got"; fail=1 ;; esac
[ $fail = 0 ] && echo "museum_details: ok"
exit $fail
