#!/bin/sh
# Text in rows too narrow for their children (flex-shrink) in classic: tests/golden/classic-shrink lays out a pane between two fixed panels and 400
# random trees of shrinking boxes; every text wraps inside its final box and stays inside the window (counts stay 0).
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run tests/golden/classic-shrink 2>&1)
[ "$out" = "$(cat tests/golden/classic-shrink/main.out)" ] || { echo "classic shrink: $(echo "$out" | tail -5)"; exit 1; }
echo "classic shrink: ok"
