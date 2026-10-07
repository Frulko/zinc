#!/bin/sh
# Frame hash contract (ZN-125): ZINC_FRAMEHASH=all|last prints "zinc: framehash <frame> <W>x<H> <fnv1a-64>" for the rasterized frame, whatever the display driver.
# The goldens sit next to the board demos (examples/boards/*/*/framehash.golden); a demo that reads width() at module level sees the board's surface (8x8, 11x5).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for g in ../examples/boards/*/*/framehash.golden; do
  d=$(dirname "$g")
  got=$(ZINC_FRAMEHASH=last ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 "$ZINC" run "$d" 2>&1 >/dev/null | grep '^zinc: framehash' | sed 's/^zinc: //')
  [ "$got" = "$(cat "$g")" ] || { echo "$d: framehash '$got', golden '$(cat "$g")'"; fail=1; }
done
n=$(ZINC_FRAMEHASH=all ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=5 "$ZINC" run ../examples/breakout 2>&1 >/dev/null | grep -c '^zinc: framehash')
[ "$n" = 5 ] || { echo "ZINC_FRAMEHASH=all printed $n lines for 5 frames"; fail=1; }
[ -z "$(ZINC_HEADLESS=1 ZINC_FRAMES=2 "$ZINC" run ../examples/breakout 2>&1 | grep framehash)" ] || { echo "framehash printed without ZINC_FRAMEHASH"; fail=1; }
[ $fail -eq 0 ] && echo "framehash: ok"
exit $fail
