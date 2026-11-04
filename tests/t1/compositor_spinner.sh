#!/bin/sh
# A spinner keeps turning while the script is busy (D182 step 6): tests/golden/busy-spinner shows the kit's Spinner, and at frame 60 its
# frame callback busy-waits 2 s. In a window, with the render thread, the compositor presents the spinner turned on at each frame meanwhile:
# every 120 presents, ZINC_PRESENT_STATS's present interval has p99 <= 17.5 ms (60 Hz; COMPOSITOR_SPINNER_P99 to change it) and no stall
# (max < 100 ms). Without the compositor (ZINC_COMPOSITOR=0) the same run shows the 2 s stall, so the check can fail.
# Measures time: run it alone, on a quiet machine (AGENTS.md); skipped without a window.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: the render thread is macOS only"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
lim=${COMPOSITOR_SPINNER_P99:-17.5}
fail=0
for c in 1 0; do
  ZINC_COMPOSITOR=$c ZINC_PRESENT_STATS=1 ZINC_BACKGROUND=1 ZINC_FRAMES=200 env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC -u ZINC_RENDER_THREAD \
    timeout 60 "$ZINC" run --interp tests/golden/busy-spinner >"$tmp/out$c" 2>"$tmp/err$c"
  grep -q '^busy for 2 s' "$tmp/out$c" || { echo "compositor_spinner: the program did not run: $(tail -3 "$tmp/err$c")"; exit 1; }
  grep '^zinc present:' "$tmp/err$c" | sed 's/.* interval p50 [0-9.]* p99 \([0-9.]*\) max \([0-9.]*\) ms.*/\1 \2/' > "$tmp/s$c"
  [ -s "$tmp/s$c" ] || { echo "skipped: no present statistics (no window here)"; exit 77; }
done
echo "compositor_spinner: with the compositor, interval p99 and max per 120 presents (ms): $(tr '\n' ';' < "$tmp/s1")"
awk -v lim="$lim" '$1 > lim || $2 >= 100 { bad = 1 } END { exit bad }' "$tmp/s1" || { echo "compositor_spinner: the presents stalled or slowed while the script was busy"; fail=1; }
awk '$2 >= 1500 { seen = 1 } END { exit !seen }' "$tmp/s0" || { echo "compositor_spinner: no 2 s stall without the compositor: the check proves nothing ($(tr '\n' ';' < "$tmp/s0"))"; fail=1; }
[ $fail -eq 0 ] && echo "compositor_spinner: ok"
exit $fail
