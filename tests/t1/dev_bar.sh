#!/bin/sh
# The dev bar (ZN-822): ZINC_DEV_BAR=1 draws a strip over the program (the frame differs only inside it), a press on it or on its open menu
# never reaches the program, its X quits, and its menu restarts (exit 75 for the agent), shows the performance panel and saves a screenshot.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1
unset ZINC_PERF_HUD ZINC_SCALE ZINC_DEV ZINC_DEV_BAR
fail=0
cat > "$tmp/app.ts" <<'T'
import { onFrame, clear, rect, pointerDown } from 'zinc:gfx';
let n = 0;
onFrame(() => { clear(0x202020); rect(10, 30, 50, 50, 0xff0000); if (pointerDown()) console.log('the program saw a press'); if (++n == 20) console.log('still running'); });
T
run() { "$ZINC" run "$tmp/app.ts" --interp 2>&1; }
# 1. off by default; on, only the bar's strip differs (320 wide, 14 high); its menu opens below it
ZINC_FRAMES=6 ZINC_SHOT="$tmp/off.png" run >/dev/null
ZINC_DEV_BAR=1 ZINC_FRAMES=6 ZINC_SHOT="$tmp/on.png" run >/dev/null
bb=$(tools/pngdiff "$tmp/off.png" "$tmp/on.png" --bbox | sed -n 's/^bbox //p')
[ "$bb" = "0 0 320 14" ] || { echo "the frame differs outside the bar: bbox $bb"; fail=1; }
printf '3 move 5 5\n3 down\n4 up\n' > "$tmp/menu.in"
out=$(ZINC_DEV_BAR=1 ZINC_FRAMES=8 ZINC_INPUT="$tmp/menu.in" ZINC_SHOT="$tmp/menu.png" run)
bb=$(tools/pngdiff "$tmp/off.png" "$tmp/menu.png" --bbox | sed -n 's/^bbox //p')
[ "$bb" = "0 0 320 62" ] || { echo "the menu is not below the bar: bbox $bb"; fail=1; }
echo "$out" | grep -q "the program saw a press" && { echo "the program saw the press on the bar"; fail=1; }
# 2. a press beside the open menu closes it and is not the program's; a press elsewhere is
printf '3 move 5 5\n3 down\n4 up\n6 move 200 150\n6 down\n7 up\n10 move 200 150\n10 down\n11 up\n' > "$tmp/close.in"
out=$(ZINC_DEV_BAR=1 ZINC_FRAMES=14 ZINC_INPUT="$tmp/close.in" ZINC_SHOT="$tmp/closed.png" run)
[ "$(echo "$out" | grep -c 'the program saw a press')" = 1 ] || { echo "close the menu: the program saw $(echo "$out" | grep -c 'saw a press') presses (1 expected)"; fail=1; }
bb=$(tools/pngdiff "$tmp/off.png" "$tmp/closed.png" --bbox | sed -n 's/^bbox //p')
[ "$bb" = "0 0 320 14" ] || { echo "the menu stayed open: bbox $bb"; fail=1; }
# 3. the X ends the program
printf '3 move 310 5\n3 down\n4 up\n' > "$tmp/x.in"
out=$(ZINC_DEV_BAR=1 ZINC_FRAMES=40 ZINC_INPUT="$tmp/x.in" run)
echo "$out" | grep -q "still running" && { echo "the X did not quit"; fail=1; }
# 4. the menu: the performance panel, a screenshot without the bar, a restart (exit 75, for the agent) in a zinc dev program
printf '3 move 5 5\n3 down\n4 up\n6 move 20 38\n6 down\n7 up\n' > "$tmp/perf.in"
out=$(ZINC_PROFILE=1 ZINC_DEV_BAR=1 ZINC_FRAMES=10 ZINC_INPUT="$tmp/perf.in" run)
echo "$out" | grep -q "^zinc perf hud: " || { echo "Performance panel did not show the panel: $out"; fail=1; }
printf '3 move 5 5\n3 down\n4 up\n6 move 20 54\n6 down\n7 up\n' > "$tmp/shot.in"
out=$(ZINC_DEV_BAR=1 ZINC_SHOT_DIR="$tmp" ZINC_FRAMES=10 ZINC_INPUT="$tmp/shot.in" run)
shot=$(echo "$out" | sed -n 's/^zinc dev: screenshot saved to //p')
[ -f "$shot" ] && tools/pngdiff "$tmp/off.png" "$shot" >/dev/null || { echo "the screenshot is missing or shows the bar ($shot): $out"; fail=1; }
printf '3 move 5 5\n3 down\n4 up\n6 move 20 22\n6 down\n7 up\n' > "$tmp/restart.in"
ZINC_DEV=1 ZINC_DEV_BAR=1 ZINC_FRAMES=40 ZINC_INPUT="$tmp/restart.in" run >/dev/null; code=$?
[ $code -eq 75 ] || { echo "Restart: exit $code (75 expected)"; fail=1; }
[ $fail -eq 0 ] && echo "dev bar: ok"
exit $fail
