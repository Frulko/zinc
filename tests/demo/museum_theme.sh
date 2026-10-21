#!/bin/sh
# Museum table, the theme's fonts and logo (ZN-650.14): a project whose theme names two font files and a logo of its folder
# (tests/data/museum_theme/project.json) shows them on the table: the frame is the golden (tests/golden/museum-table/theme.png). Each of the three counts: the frame changes when the text font, the title font or the logo is taken
# out of the theme. A font file that is not there leaves the table in its own fonts, without a fault.
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_theme; golden=$PWD/tests/golden/museum-table/theme.png; editor=$PWD/tests/golden/museum-table/theme-editor.png; tools=$PWD/tools
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/a/fonts"
cp tests/data/fonts_runtime/assets/fonts/PublicSans-Medium.ttf lib/fonts/JetBrainsMono-Regular.ttf "$tmp/a/fonts/" || exit 2
cp examples/pocket-hero/assets/logo.png "$tmp/a/logo.png" || exit 2
cd examples/museum-table || exit 2
fail=0
table() {  # the project file, extra arguments of zinc run: the story on stdout, the frame in $tmp/shot.png, its hash in $tmp/hash
  cp "$1" "$tmp/a/project.json"
  ZINC_ASSETS="$tmp/a" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_FRAMES=3 ZINC_FRAMEHASH=last ZINC_SHOT="$tmp/shot.png" "$ZINC" run $2 . -- --story 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" | cut -d' ' -f3 > "$tmp/hash"
}
table "$d/project.json" --interp > "$tmp/story"
themed=$(cat "$tmp/hash")
grep -q 'fault' "$tmp/story" "$tmp/err" && { echo "museum_theme: the themed table has a fault: $(grep -h fault "$tmp/story" "$tmp/err" | head -2)"; fail=1; }
"$tools/pngdiff" "$tmp/shot.png" "$golden" > "$tmp/diff" 2>&1 || { echo "museum_theme: the frame differs from the golden: $(head -1 "$tmp/diff")"; fail=1; }

for part in '"font": "fonts\/PublicSans-Medium.ttf", ' '"titleFont": "fonts\/JetBrainsMono-Regular.ttf", ' ', "logo": "logo.png"'; do
  sed "s/$part//" "$d/project.json" > "$tmp/less.json"
  cmp -s "$tmp/less.json" "$d/project.json" && { echo "museum_theme: the test does not take $part out"; fail=1; }
  table "$tmp/less.json" --interp > /dev/null
  [ -n "$(cat "$tmp/hash")" ] && [ "$(cat "$tmp/hash")" != "$themed" ] || { echo "museum_theme: the table is the same without $part"; fail=1; }
  [ -z "$plain" ] && plain=$(cat "$tmp/hash")   # without the text font: the title font and the logo alone
done
# a font file that is not in the folder: the table's own font, as when the theme names none
sed 's/PublicSans-Medium/Absent/' "$d/project.json" > "$tmp/absent.json"
table "$tmp/absent.json" --interp > "$tmp/story"
[ "$(cat "$tmp/hash")" = "$plain" ] || { echo "museum_theme: a font file that is missing does not leave the table's own font"; fail=1; }
grep -q ' sequence a$' "$tmp/story" || { echo "museum_theme: a font file that is missing stops the table: $(head -2 "$tmp/story")"; fail=1; }

# the editor, on that project with no theme, in a folder that holds the two font files and the picture: the theme form offers them beside the
# three families; "mono" for the texts, a font file for the titles and the picture for the logo are clicked, and Save: the file names them,
# the form and the live sample (the texts in the family, the titles in the font file, the logo) are the golden, and the table plays the saved file with all three
mkdir -p "$tmp/e/fonts"; cp "$tmp/a/fonts/"*.ttf "$tmp/e/fonts/"; cp "$tmp/a/logo.png" "$tmp/e/"
grep -v '"theme": {' "$d/project.json" > "$tmp/e/project.json"
MUSEUM_EDITOR_LANG=en ZINC_INPUT="$d/editor.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=70 ZINC_SHOT="$tmp/editor.png" \
  "$ZINC" run editor -- "$tmp/e/project.json" > "$tmp/out" 2>&1 || { echo "museum_theme: the editor failed: $(head -c 300 "$tmp/out")"; fail=1; }
for line in '"font": "mono"' '"titleFont": "fonts/JetBrainsMono-Regular.ttf"' '"logo": "logo.png"'; do
  grep -q -- "$line" "$tmp/e/project.json" || { echo "museum_theme: the file the editor saved has no $line"; fail=1; }
done
[ -n "$ZN_UPDATE_GOLDEN" ] && cp "$tmp/editor.png" "$editor"
"$tools/pngdiff" "$tmp/editor.png" "$editor" > "$tmp/diff" 2>&1 || { echo "museum_theme: the editor's frame differs from the golden: $(head -1 "$tmp/diff")"; fail=1; }
# the live sample follows the font file itself: the same session in a folder where that file holds another face ends on another frame
mkdir -p "$tmp/f/fonts"; cp "$tmp/a/logo.png" "$tmp/f/"; cp "$tmp/a/fonts/PublicSans-Medium.ttf" "$tmp/f/fonts/"; cp "$tmp/a/fonts/PublicSans-Medium.ttf" "$tmp/f/fonts/JetBrainsMono-Regular.ttf"
grep -v '"theme": {' "$d/project.json" > "$tmp/f/project.json"
MUSEUM_EDITOR_LANG=en ZINC_INPUT="$d/editor.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=70 ZINC_SHOT="$tmp/other.png" \
  "$ZINC" run editor -- "$tmp/f/project.json" > "$tmp/out" 2>&1 || { echo "museum_theme: the editor failed on the other font: $(head -c 300 "$tmp/out")"; fail=1; }
"$tools/pngdiff" "$tmp/other.png" "$tmp/editor.png" > /dev/null 2>&1 && { echo "museum_theme: the editor's live sample does not follow the font file of the folder"; fail=1; }
table "$tmp/e/project.json" --interp > "$tmp/story"
grep -q ' sequence a$' "$tmp/story" && ! grep -q fault "$tmp/story" "$tmp/err" || { echo "museum_theme: the table does not play the file the editor saved: $(head -2 "$tmp/story")"; fail=1; }
[ -n "$(cat "$tmp/hash")" ] && [ "$(cat "$tmp/hash")" != "$themed" ] && [ "$(cat "$tmp/hash")" != "$plain" ] || { echo "museum_theme: the table does not show what the editor chose"; fail=1; }

[ $fail = 0 ] && echo "museum_theme: ok"
exit $fail
