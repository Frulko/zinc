#!/bin/sh
# A setTimeout(0) set from inside a timer waits for the next frame (src/frontend/modules.cpp __frameTimers, src/qjs/prelude.cpp
# __dueTimer): a computation that yields with it lets the frames through, on the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for engine in --interp "" "--engine quickjs"; do
  out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 timeout 120 "$ZINC" run tests/data/timer-yield/main.ts $engine 2>&1 | grep 'one step')
  [ "$out" = "one step a frame true" ] || { echo "timer_yield ($engine): $out"; fail=1; }
done
exit $fail
