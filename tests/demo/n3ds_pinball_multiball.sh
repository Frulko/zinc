#!/bin/sh
# The real two-screen application stays in bounds with three balls and its native Box2D adapter.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1200 "$ZINC" run examples/n3ds-pinball/tools/multiball.ts --interp >"$tmp/out" 2>&1 \
  || { cat "$tmp/out"; exit 1; }
grep -q 'pinball probe: 3 balls served' "$tmp/out" || { cat "$tmp/out"; exit 1; }
[ "$(grep -c 'pinball probe: .* s,' "$tmp/out")" -ge 3 ] || { cat "$tmp/out"; exit 1; }
