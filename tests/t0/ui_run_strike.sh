#!/bin/sh
# ui.RUN_STRIKE strikes a run of setTextRuns through (Discord's ~~strike~~): the frame differs from the same run plain and underlined, and
# is the same on the interpreter, the default engine and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
hash() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x60 ZINC_FRAMES=3 ZINC_FRAMEHASH=last RUN_STYLE=$1 "$ZINC" run tests/data/ui-run-strike/main.ts $2 2>&1 | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' | tail -1; }
plain=$(hash 0) under=$(hash 8) strike=$(hash 16)
fail=0
[ -n "$strike" ] || { echo "ui_run_strike: no frame hash"; exit 1; }
[ "$strike" != "$plain" ] || { echo "ui_run_strike: the struck run looks plain"; fail=1; }
[ "$strike" != "$under" ] || { echo "ui_run_strike: the struck run looks underlined"; fail=1; }
for e in --interp "--engine quickjs"; do
  [ "$(hash 16 "$e")" = "$strike" ] || { echo "ui_run_strike: $e draws another frame"; fail=1; }
done
exit $fail
