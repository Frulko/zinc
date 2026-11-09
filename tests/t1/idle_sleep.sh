#!/bin/sh
# An idle window sleeps (ZN-805, macOS): tests/golden/macos/idle is a zinc:ui screen where nothing moves, in the background.
# 1. Once its frames change nothing, the loop turns at most about 10 times a second (it turned 60 times before), waiting for an event.
# 2. A timer still fires on time: the wait ends when the program's next timer is due (host.gfxIdleDue).
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
log=$(ZINC_BACKGROUND=1 ZINC_SIZE=400x300 env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC -u ZINC_FRAMES timeout 60 "$ZINC" run --interp tests/golden/macos/idle 2>&1)
line=$(printf '%s\n' "$log" | grep '^idle ')
[ -n "$line" ] || { echo "idle_sleep: the program did not run to its end:"; printf '%s\n' "$log" | tail -5; exit 1; }
turns=$(printf '%s\n' "$line" | sed -n 's/^idle \([0-9.]*\) turns.*/\1/p')
late=$(printf '%s\n' "$line" | sed -n 's/.*timer late \(-*[0-9.]*\) ms/\1/p')
fail=0
awk "BEGIN{exit !($turns <= 15)}" || { echo "idle_sleep: idle, the loop still turns $turns times a second"; fail=1; }
awk "BEGIN{exit !($late < 25)}" || { echo "idle_sleep: the timer fired $late ms late"; fail=1; }
[ $fail -eq 0 ] && echo "idle_sleep: ok ($turns turns/s idle, timer $late ms late)"
exit $fail
