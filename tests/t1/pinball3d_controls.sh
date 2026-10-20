#!/bin/sh
# The 3D pinball's controls (ZN-649.07, examples/pinball3d/src/input.ts), with no hardware: scripted gamepads (ZINC_INPUT gamepad, gbutton).
# - A gamepad plays the scripted game (tests/data/pinball3d/play.py --gamepad: start, the plunger on the south button, the flippers on the
#   two triggers, the bump on the west button) and prints the score log of the keyboard-and-buttons game, tests/data/pinball3d/play.log.
# - A settings file that gives every action another input is obeyed: the same hands on the buttons it names play the same first twelve
#   seconds (start, plunger, both flippers, a bump from the left), the bumps from the right and the front bump the table, its next-table
#   button goes to the second table, and the default buttons no longer do anything.
# - A wrong binding is reported by its name: an input that is none, an action that is none.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: python3 is not installed"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ex=examples/pinball3d
data=$PWD/tests/data/pinball3d
game() {   # the input, frames, then what the game takes: its output
  in=$1; frames=$2; shift 2
  ZINC_INPUT=$in ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=$frames "$ZINC" run $ex -- --log "$@" 2>&1
}

python3 "$data/play.py" --gamepad > "$tmp/pad.input"
game "$tmp/pad.input" 3600 > "$tmp/pad.log"
cmp -s "$tmp/pad.log" "$data/play.log" || { echo "pinball3d_controls: a gamepad does not play the scripted game as play.log: $(diff "$tmp/pad.log" "$data/play.log" | head -5 | tr '\n' ';')"; fail=1; }

# every action on another button: left east, right north, plunger west, the bumps on the stick clicks and guide, start back, next table left shoulder
cat > "$tmp/settings.json" <<'E'
{ "controls": { "left": ["gamepad:East"], "right": ["gamepad:North"], "plunger": ["gamepad:West"], "nudgeLeft": ["gamepad:LeftStick"],
  "nudgeRight": ["gamepad:RightStick"], "nudgeUp": ["gamepad:Guide"], "start": ["gamepad:Back"], "nextTable": ["gamepad:LeftShoulder"] } }
E
head -1 "$tmp/pad.input" > "$tmp/remap.input"
sed 1d "$tmp/pad.input" | awk '{ b = $4; $4 = b == 9 ? 8 : b == 0 ? 2 : b == 6 ? 1 : b == 7 ? 3 : 10; print }' >> "$tmp/remap.input"
game "$tmp/remap.input" 760 "--settings=$tmp/settings.json" > "$tmp/remap.log"
n=$(wc -l < "$tmp/remap.log")
[ "$n" -ge 20 ] && head -n "$n" "$data/play.log" | cmp -s - "$tmp/remap.log" && grep -q " game bump" "$tmp/remap.log" && grep -q " left flip" "$tmp/remap.log" && grep -q " right flip" "$tmp/remap.log" \
  || { echo "pinball3d_controls: the remapped buttons do not play the start of play.log ($n lines): $(head -n "$n" "$data/play.log" | diff "$tmp/remap.log" - | head -4 | tr '\n' ';')"; fail=1; }
game "$tmp/pad.input" 200 "--settings=$tmp/settings.json" > "$tmp/old.log"
[ -s "$tmp/old.log" ] && { echo "pinball3d_controls: the default buttons still act after a settings file replaced them: $(head -2 "$tmp/old.log" | tr '\n' ';')"; fail=1; }
printf '0 gamepad 0\n20 gbutton 0 8\n24 gbuttonup 0 8\n60 gbutton 0 2\n130 gbuttonup 0 2\n200 gbutton 0 11\n203 gbuttonup 0 11\n260 gbutton 0 16\n263 gbuttonup 0 16\n' > "$tmp/bumps.input"
[ "$(game "$tmp/bumps.input" 300 "--settings=$tmp/settings.json" | grep -c ' game bump')" = 2 ] || { echo "pinball3d_controls: the remapped bumps from the right and the front do not bump the table"; fail=1; }
printf '0 gamepad 0\n8 gbutton 0 4\n10 gbuttonup 0 4\n20 gbutton 0 8\n24 gbuttonup 0 8\n' > "$tmp/next.input"
first=$(game "$tmp/pad.input" 40 | head -1); second=$(game "$tmp/next.input" 40 "--settings=$tmp/settings.json" | head -1)
case "$first|$second" in "0.000 game start|table "*) ;; *) echo "pinball3d_controls: the remapped next-table button does not go to the second table: '$first' then '$second'"; fail=1 ;; esac

wrong() {   # the settings, what the game must say
  printf '%s\n' "$1" > "$tmp/wrong.json"
  game /dev/null 1 "--settings=$tmp/wrong.json" | grep -qF "$2" || { echo "pinball3d_controls: not reported: $2 (got: $(game /dev/null 1 "--settings=$tmp/wrong.json" | head -c 200))"; fail=1; }
}
wrong '{ "controls": { "plunger": ["key:enter", "gamepad:Turbo"] } }' 'controls.plunger[1]: "gamepad:Turbo" is no input'
wrong '{ "controls": { "flipper": ["key:a"] } }' 'controls.flipper: is no action (left right plunger nudgeLeft nudgeRight nudgeUp start nextTable)'
wrong '{ "controls": { "start": "key:a" } }' 'controls.start: must be a list of inputs'
exit $fail
