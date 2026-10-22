#!/bin/sh
# The primitives draw nothing a program did not ask for (docs/ui.md, "What the primitives draw"; ZN-774.18, D163): tests/golden/ui-neutral
# mounts a bare View, Text, Button, Input, TextArea and a View with onClick on a light and a dark window. The commands of frames 4 (the Input
# focused as a click focuses it) and 8 (Tab moved the focus to the TextArea), read from the scene dump (tools/scene-texts --cmds), are
# expected.txt: the texts in black on the light window and white on the dark one, the caret, the keyboard ring around the borderless
# TextArea, and no RECT or BORDER of a fill, a border or a padding. UI_NEUTRAL_BLESS=1 rewrites expected.txt.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-neutral
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for w in light dark; do
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=240x200 ZINC_FRAMES=9 ZINC_SHOT_FRAMES=4,8 ZINC_SCENE_DUMP="$t/$w.scn" \
    "$ZINC" run $d/$w.tsx >"$t/$w.out" 2>&1 || { echo "ui_neutral: $w.tsx failed:"; tail -5 "$t/$w.out"; exit 1; }
  for f in 4 8; do
    [ -f "$t/$w-$f.scn" ] || { echo "ui_neutral: no scene dump of $w frame $f"; exit 1; }
    echo "== $w frame $f"; python3 tools/scene-texts --cmds "$t/$w-$f.scn"
  done
done > "$t/got.txt"
[ -n "$UI_NEUTRAL_BLESS" ] && cp "$t/got.txt" $d/expected.txt
if diff $d/expected.txt "$t/got.txt" > "$t/d"; then echo "ui_neutral: ok"; exit 0; fi
echo "ui_neutral: the primitives draw other commands than tests/golden/ui-neutral/expected.txt:"; cat "$t/d"; exit 1
