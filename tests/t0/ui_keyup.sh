#!/bin/sh
# ui.onKeyUp hears a key's release, and a modifier held alone is a key of its own ('Shift', 'Control', 'Alt', 'Meta'), down and up, on the
# typed engine and on QuickJS (trieur's Shift that stacks zones until it is let go). The script's `keyup` and `hold` lines make them.
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/ui-keyup
fail=0
for engine in interp quickjs; do
  if [ $engine = interp ]; then flag=--interp; else flag="--engine quickjs"; fi
  out=$(ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_INPUT=$d/session.input "$ZINC" run $d/main.ts $flag 2>&1 | grep -E '^(down|up) ')
  [ "$out" = "$(cat $d/expected.out)" ] || { echo "$engine: got"; echo "$out"; fail=1; }
done
exit $fail
