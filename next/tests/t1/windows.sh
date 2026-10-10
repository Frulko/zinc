#!/bin/sh
# More windows for one app (ZN-663). tests/data/windows: the main window and a second one (zinc:gfx openWindow) draw different frames and each
# receives its own clicks (scripted input, ZINC_INPUT: `window N` sends the next events of a frame to window N, `close` closes it); the frames
# of both are equal to their goldens (ZINC_SHOT writes the second one as <name>-w1.png), interpreted and compiled. Closing the side window keeps
# the main one; closing the main one first hides it and the side one goes on, until closing it ends the program (before ZINC_FRAMES).
# tests/data/ui_windows: two zinc:ui trees (zinc:ui/solid renderWindow) share the program's signals: a click in each window updates the other one.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
run() {   # name interp|native project frames input [shot frames]
  env ZINC_RUN=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=$4 ZINC_INPUT="$PWD/$5" ZINC_SHOT="$tmp/$1.png" ${6:+ZINC_SHOT_FRAMES=$6} "$ZINC" run "$3" >"$tmp/$1.log" 2>&1 ||
    { echo "$1: exit $?: $(head -c 300 "$tmp/$1.log")"; fail=1; }
}
same() {   # image golden
  tools/pngdiff "$1" "$2" >"$tmp/d" 2>&1 || { echo "$(basename "$1") differs from $2: $(head -1 "$tmp/d")"; fail=1; }
}
want() {   # log line
  grep -qx "$2" "$tmp/$1.log" || { echo "$1: no line '$2' in: $(tr '\n' '|' <"$tmp/$1.log" | head -c 400)"; fail=1; }
}
for r in interp native; do
  run side-$r $r tests/data/windows 8 tests/data/windows/close-side.input 4
  want side-$r "frame 2: main click at 50,30 in 320x240"
  want side-$r "frame 3: side click at 40,20 in 200x120"
  want side-$r "frame 5: the side window closed, the main one goes on"
  same "$tmp/side-$r-4.png" tests/golden/windows/main.png
  same "$tmp/side-$r-4-w1.png" tests/golden/windows/side.png
  run main-$r $r tests/data/windows 20 tests/data/windows/close-main.input
  want main-$r "frame 3: the main window closed, the side one goes on"
  want main-$r "frame 6: side drawn"
  grep -q "frame 8: side drawn" "$tmp/main-$r.log" && { echo "main-$r: the program went on after its last window closed"; fail=1; }
done
run ui interp tests/data/ui_windows 20 tests/data/ui_windows/session.input
want ui "editor: 2 tiles"
want ui "preview: 1 pings"
same "$tmp/ui.png" tests/golden/windows/ui-editor.png
same "$tmp/ui-w1.png" tests/golden/windows/ui-preview.png
exit $fail
