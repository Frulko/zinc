#!/bin/sh
# examples/sprite-studio, three windows that talk: a scripted headless session on the interpreter pauses the preview and picks and edits a
# colour from the tools window (MessageChannel to the canvas), draws a stroke on the canvas, adds a frame and undoes it, saves and loads,
# closes and reopens both side windows. Goldens: the canvas, the tools and the worker's preview (one each), and the canvas after the undo.
# Then the idle check, and a few frames on the AOT and QuickJS compared with the interpreter (QuickJS has no workers: its preview window
# says so, and only the canvas and the tools are compared there). UPDATE=1 rewrites the goldens.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=tests/golden/sprite-studio
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="${ZINC_HOME:-$tmp/home}" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 SPRITE_STUDIO_FILE="$tmp/sprite.json"
limit=$((60 * ${ZN_WAIT_SCALE:-1}))
fail=0
want() {   # log line
  grep -qxF "$2" "$tmp/$1.log" || { echo "$1: no line '$2' in: $(tr '\n' '|' <"$tmp/$1.log" | tail -c 600)"; fail=1; }
}
same() {   # shot golden
  if [ -n "${UPDATE:-}" ]; then mkdir -p "$gold"; cp "$1" "$2"; return; fi
  tools/pngdiff "$1" "$2" >"$tmp/d" 2>&1 || { echo "$(basename "$1") differs from $2: $(head -1 "$tmp/d")"; fail=1; }
}
timeout "$limit" "$Z" check examples/sprite-studio >"$tmp/check.log" 2>&1 || { echo "check: $(tail -5 "$tmp/check.log")"; exit 1; }

ZINC_FRAMES=56 ZINC_INPUT="$(pwd)/tests/data/sprite-studio/session.input" ZINC_SHOT="$tmp/s.png" ZINC_SHOT_FRAMES=3,30,40,56 \
  timeout "$limit" "$Z" run --interp examples/sprite-studio >"$tmp/s.log" 2>&1 || { echo "session: exit $?: $(tail -c 600 "$tmp/s.log")"; exit 1; }
want s "windows: 0@550,80 560x600 1@278,80 260x660 2@1122,80 520x290"
want s "canvas: play"
want s "canvas: color 9"
want s "canvas: edit-color ffbe3b 9"
want s "saved $tmp/sprite.json"
want s "loaded 4 frames"
grep -q '"#ffbe3b"' "$tmp/sprite.json" && grep -q '"00999999999990000000000000000000"' "$tmp/sprite.json" ||
  { echo "the saved sprite lacks the edited colour or the stroke"; fail=1; }
same "$tmp/s-30.png" "$gold/canvas.png"
same "$tmp/s-30-w1.png" "$gold/tools.png"
same "$tmp/s-30-w2.png" "$gold/preview.png"
same "$tmp/s-40.png" "$gold/canvas-undo.png"
[ -f "$tmp/s-56-w3.png" ] && [ -f "$tmp/s-56-w4.png" ] && [ ! -f "$tmp/s-56-w1.png" ] && [ ! -f "$tmp/s-56-w2.png" ] ||
  { echo "the closed side windows did not reopen as windows 3 and 4: $(ls "$tmp" | grep s-56 | tr '\n' ' ')"; fail=1; }

ZINC_FRAMES=300 ZINC_PROFILE=1 timeout "$limit" "$Z" run --interp examples/sprite-studio >"$tmp/idle.log" 2>&1 || { echo "idle: exit $?"; fail=1; }
grep -q 'zinc profile: paint p50=0.00 p99=0.00 ' "$tmp/idle.log" || { echo "the canvas repaints while idle: $(grep 'paint' "$tmp/idle.log" | head -1)"; fail=1; }

for r in native quickjs; do
  if [ $r = native ]; then set -- --native; else set -- --engine quickjs; fi
  ZINC_FRAMES=4 ZINC_SHOT="$tmp/$r.png" ZINC_SHOT_FRAMES=3 timeout "$((3 * limit))" "$Z" run examples/sprite-studio "$@" >"$tmp/$r.log" 2>&1 ||
    { echo "$r: exit $?: $(tail -c 400 "$tmp/$r.log")"; fail=1; continue; }
  for w in "" -w1; do cmp -s "$tmp/$r-3$w.png" "$tmp/s-3$w.png" || { echo "$r: window${w:-0} differs from the interpreter's"; fail=1; }; done
done
cmp -s "$tmp/native-3-w2.png" "$tmp/s-3-w2.png" || { echo "native: the worker's preview differs from the interpreter's"; fail=1; }
want quickjs "preview: Error: zinc:worker runs on the Zinc engine (zinc run, zinc build); QuickJS has no workers yet"
[ $fail = 0 ] && echo 'sprite_studio: session, three windows, save/load, reopen, idle, AOT and QuickJS ok'
exit $fail
