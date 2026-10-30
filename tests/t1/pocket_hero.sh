#!/bin/sh
# examples/pocket-hero, PocketJS's Hero compiled unchanged: View, Text and Image of '@pocketjs/framework/solid/components' are host elements (they were
# taken for components and every tag failed with Z0105), the demo checks and runs headless.
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" check examples/pocket-hero 2>&1) || { echo "pocket-hero check: $(echo "$out" | head -3)"; exit 1; }
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 "$ZINC" run examples/pocket-hero 2>&1) || { echo "pocket-hero run: $(echo "$out" | tail -3)"; exit 1; }
echo "pocket hero: ok"
