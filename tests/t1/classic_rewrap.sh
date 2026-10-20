#!/bin/sh
# Re-wrap of text at its final width in classic (ZN-287): tests/golden/classic-rewrap lays out 400 random nested trees and counts texts whose lines overflow
# their box or leave it unused; both counts must stay 0.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run tests/golden/classic-rewrap 2>&1)
[ "$out" = "$(cat tests/golden/classic-rewrap/main.out)" ] || { echo "classic rewrap: $(echo "$out" | tail -5)"; exit 1; }
echo "classic rewrap: ok"
