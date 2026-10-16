#!/bin/sh
# A live resize on macOS: while the window's edge is dragged, AppKit holds the event loop in its tracking loop and the window HAL draws the
# program's frames from SDL's event watcher (zrt_redraw, the engine's frame step). ZINC_LIVE_RESIZE=n drives that path without a mouse: n size
# steps inside one poll, each with the live-resize expose of SDL's timer. Every step must present a frame at the new size (no stretched old frame),
# laid out again at that size, with the program's interval timer still firing; one layout per size, a bound on the allocations of those frames,
# and zinc.json's minWidth/minHeight/maxWidth/maxHeight hold. The long proof on the native program, short ones on the interpreter and QuickJS.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
d=$(cd "$(dirname "$0")/../golden/macos/live-resize" && pwd) || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME" "$tmp/qjs"
fail=0
check() {   # check <label> <steps> <dir> <entry> [run flags]: the size steps, then the three sizes of the limits probe (far in, far out, back)
  label=$1 steps=$2 dir=$3; shift 3
  out=$(cd "$dir" && env -u ZINC_DETERMINISTIC -u ZINC_HEADLESS ZINC_BACKGROUND=1 ZINC_LIVE_RESIZE=$steps ${zoom:+ZINC_LIVE_RESIZE_ZOOM=1} "$ZINC" run "$@" 2>&1)
  echo "$out" | grep -q "^zinc: live resize: $steps of $steps steps drawn at the new size" || { echo "window_live_resize: $label: $(echo "$out" | grep 'steps drawn' || echo "$out" | tail -3)"; fail=1; }
  echo "$out" | grep -q '^zinc: live resize: limits 360x240 to 900x700$' || { echo "window_live_resize: $label: size limits: $(echo "$out" | grep limits)"; fail=1; }
  line=$(echo "$out" | grep '^sizes ')
  set -- $line   # sizes N stale S timers ran|stopped layouts L
  [ "$2" -ge $((steps + 3)) ] && [ "$4" = 0 ] && [ "$6" = ran ] && [ "$8" -le "$2" ] || { echo "window_live_resize: $label: $line"; fail=1; }
}
zoom=1; check native 120 "$d" main.ts
echo "$out" | grep -Eq "^zinc: live resize: zoom to [0-9]+x[0-9]+, [1-9][0-9]* frames" || { echo "window_live_resize: zoom button: $(echo "$out" | grep zoom)"; fail=1; }
zoom=
allocs=$(echo "$out" | sed -n 's/^allocations //p'); sizes=$(echo "$out" | sed -n "s/^sizes \([0-9]*\).*/\1/p")
# measured about 70 per size (2026-10-16): the timer's re-arms, the layout and the text wrapped again; 100 per size is the bound
[ -n "$allocs" ] && [ -n "$sizes" ] && [ "$allocs" -le $((sizes * 100)) ] || { echo "window_live_resize: allocations during the drag: $allocs for $sizes sizes (bound 100 each)"; fail=1; }
check interp 10 "$d" main.ts --interp
# QuickJS has no zinc:sys allocations (the typed engines' counter)
sed "s/import { allocations } from 'zinc:sys';/const allocations = (): number => 0;/" "$d/main.ts" > "$tmp/qjs/main.ts" && cp "$d/zinc.json" "$tmp/qjs/"
check quickjs 10 "$tmp/qjs" main.ts --engine quickjs
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.liveresize.app" >/dev/null 2>&1
[ $fail -eq 0 ] && echo "window live resize: ok"
exit $fail
