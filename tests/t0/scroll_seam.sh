#!/bin/sh
# Pixel Plays ScrollLayer: a window assembled from chunks equals the same region baked in one piece (colours, masks, kinds, tufts, leaves), on the
# interpreter and on the default engine.
cd "$(dirname "$0")/../.." || exit 2
for m in --interp ""; do
  out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run tests/data/pixel-plays/scroll-seam.ts $m 2>&1)
  case "$out" in "seams ok"*) ;; *) echo "scroll_seam ($m): $out"; exit 1 ;; esac
done
echo "scroll_seam: ok"
