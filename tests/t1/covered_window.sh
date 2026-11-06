#!/bin/sh
# A window nobody sees (ZN-1000, macOS): tests/golden/macos/covered animates, hides its window for 2 s and shows it again, in the background.
# 1. Hidden, it stops presenting and drops to the idle rate (at most 20 frames a second; it ran at 100 to 125 before), and no frame waits
#    for a drawable that never comes (a covered window's nextDrawable held the script about 1 s).
# 2. Shown again, it is back at the display's rate at once, and every present equals a full redraw of its frame (ZINC_PRESENT_VERIFY: the
#    frames it skipped left no stale pixels).
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
log=$(ZINC_BACKGROUND=1 ZINC_SIZE=400x300 ZINC_WINDOW_LOG=1 ZINC_PRESENT_VERIFY=1 ZINC_PRESENT=metal env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC -u ZINC_FRAMES \
  timeout 60 "$ZINC" run --interp tests/golden/macos/covered 2>&1)
fps() { printf '%s\n' "$log" | sed -n "s/^$1 \([0-9.]*\) fps.*/\1/p"; }
gap() { printf '%s\n' "$log" | sed -n "s/^$1 .*max gap \([0-9]*\) ms/\1/p"; }
v=$(fps visible); h=$(fps hidden); s=$(fps shown)
[ -n "$s" ] || { echo "covered_window: the program did not run to its end:"; printf '%s\n' "$log" | tail -5; exit 1; }
printf '%s\n' "$log" | grep -q '^zinc present verify' || { echo "skipped: no Metal window here"; exit 77; }
awk "BEGIN{exit !($v < 40)}" && { echo "skipped: the window was not shown at the start ($v fps): covered by a fullscreen app?"; exit 77; }
fail=0
awk "BEGIN{exit !($h <= 20)}" || { echo "covered_window: hidden, the window still runs at $h fps"; fail=1; }
[ "$(gap hidden)" -lt 300 ] || { echo "covered_window: hidden, a frame waited $(gap hidden) ms"; fail=1; }
awk "BEGIN{exit !($s >= 40)}" || { echo "covered_window: shown again, only $s fps"; fail=1; }
[ "$(gap shown)" -lt 300 ] || { echo "covered_window: shown again, a frame waited $(gap shown) ms"; fail=1; }
printf '%s\n' "$log" | grep -q '^zinc: window unseen' || { echo "covered_window: the hidden window was never seen as unseen"; fail=1; }
printf '%s\n' "$log" | grep '^zinc present verify' | grep -v ': 0 stale pixels' | grep -q . && { echo "covered_window: stale pixels after the window came back:"; printf '%s\n' "$log" | grep '^zinc present verify' | grep -v ': 0 stale' | head -3; fail=1; }
[ $fail -eq 0 ] && echo "covered_window: ok (visible $v fps, hidden $h fps, shown again $s fps)"
exit $fail
