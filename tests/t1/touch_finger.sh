#!/bin/sh
# What a finger does that a mouse does not (lib/std/ui.ts): it reaches a small control it lands beside (about 44 px under a finger), it
# gives a text field the focus when it lifts without having dragged (a drag that starts on a field scrolls the page and opens no keyboard),
# and a scroll area covered by something else does not take its drags. A mouse at the same place points exactly.
cd "$(dirname "$0")/../.." || exit 2
run() { ZINC_DEMO=$2 ZINC_INPUT=tests/golden/ui/$1.input ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=24 "$ZINC" run --interp tests/golden/ui/finger.tsx 2>/dev/null; }
check() { [ "$2" = "$3" ] || { printf 'touch_finger: %s printed\n%s\nwant:\n%s\n' "$1" "$2" "$3"; exit 1; }; }
check "the finger" "$(run finger)" 'focus: the box
check
focus: the field'
check "the mouse" "$(run finger-mouse)" ''
check "the finger over a cover" "$(run finger-cover cover)" 'move 1 at 0 0
move 2 at 100 60
move 3 at 100 90
move 4 at 100 140'
echo "touch_finger: ok"
