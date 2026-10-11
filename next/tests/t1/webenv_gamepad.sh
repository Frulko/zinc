#!/bin/sh
# Gamepads (ZN-574), with no hardware. Headless, from the scripted input (ZINC_INPUT gamepad, gbutton, gaxis): a page reads
# navigator.getGamepads() and the two window events (pads.out); with no script the same page finds no gamepad and no error; Phaser 3's
# GamepadPlugin hears the pad, its buttons and its stick (phaser.out); the typed rows of zinc:gfx say the same on the interpreter and compiled
# (rows.out). Then the window HAL on SDL's dummy video driver (no window opens) with SDL's virtual gamepad, once as an Xbox pad and once as a
# DualSense: the buttons it holds in SDL's order arrive at their W3C index, the triggers as the buttons 6 and 7, the sticks as the axes 0 to 3
# (virtual.out, the same for both but the name).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
g=tests/golden/webenv/gamepad
same() { diff "$tmp/out" "$g/$1" > "$tmp/diff" || { echo "webenv_gamepad: $2 differs from $g/$1:"; head -12 "$tmp/diff"; fail=1; }; }
page() { env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 "$@" --engine quickjs > "$tmp/out" 2> "$tmp/err"; }

page ZINC_FRAMES=10 ZINC_INPUT=$g/pads.input "$ZINC" run $g/pads.js || { echo "webenv_gamepad: the page failed: $(head -c 300 "$tmp/err")"; fail=1; }
same pads.out "the page"
page ZINC_FRAMES=10 "$ZINC" run $g/pads.js || { echo "webenv_gamepad: the page with no gamepad failed"; fail=1; }
[ "$(cat "$tmp/out")" = "frame 9 done, 0 gamepads" ] && [ ! -s "$tmp/err" ] || { echo "webenv_gamepad: headless, no gamepad: $(cat "$tmp/out" "$tmp/err" | head -c 300)"; fail=1; }
page ZINC_FRAMES=12 ZINC_INPUT=$g/phaser.input "$ZINC" run $g/phaser.js || { echo "webenv_gamepad: Phaser failed: $(grep -v '^zinc: Canvas 2D\|UNSUPPORTED' "$tmp/err" | head -c 300)"; fail=1; }
same phaser.out "Phaser's GamepadPlugin"
grep -q "Uncaught" "$tmp/err" && { echo "webenv_gamepad: Phaser threw: $(grep -m1 -A3 Uncaught "$tmp/err" | cut -c1-200)"; fail=1; }

env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=9 ZINC_INPUT=$g/pads.input "$ZINC" run $g/rows.ts --interp > "$tmp/out" 2>&1
same rows.out "the typed rows (interpreter)"
if "$ZINC" build $g/rows.ts -o "$tmp/rows" > "$tmp/err" 2>&1; then
  env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=9 ZINC_INPUT=$g/pads.input "$tmp/rows" > "$tmp/out" 2>&1
  same rows.out "the typed rows (compiled)"
else echo "webenv_gamepad: zinc build failed: $(head -c 300 "$tmp/err")"; fail=1; fi

for kind in xbox ps5; do
  env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC SDL_VIDEO_DRIVER=dummy ZINC_WEB=1 ZINC_VIRTUAL_GAMEPAD=$kind ZINC_FRAMES=60 "$ZINC" run $g/pads.js --engine quickjs 2> "$tmp/err" | sed 's/"Zinc virtual [^"]*"/"NAME"/' > "$tmp/out"
  same virtual.out "SDL's virtual gamepad ($kind)"
  grep -q "\"Zinc virtual $([ $kind = ps5 ] && echo DualSense || echo Xbox pad)\"" "$tmp/out" && { echo "webenv_gamepad: the name of the $kind pad was not replaced"; fail=1; }
done
exit $fail
