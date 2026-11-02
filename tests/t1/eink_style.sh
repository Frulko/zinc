#!/bin/sh
# E-ink style mode (ZN-929): with ZINC_EINK=1 a card with a gradient, a shadow, an opacity and the four pattern fills issues no gradient, shadow or
# alpha command (the shadow is counted as left out) and renders to the golden frame hash; without it the same program draws them (the hash differs).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/eink-card
export ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 ZINC_SIZE=420x400 ZINC_SCALE=1 ZINC_HEADLESS=1
out=$(ZINC_EINK=1 ZINC_FRAMEHASH=last "$ZINC" run $d 2>&1)
echo "$out" | grep -q '^dropped [1-9]' || { echo "eink style: nothing was left out: $out"; exit 1; }
h=$(echo "$out" | grep framehash)
[ "$h" = "$(cat $d/frame.hash)" ] || { echo "eink style: $h"; exit 1; }
n=$(ZINC_FRAMEHASH=last "$ZINC" run $d 2>&1 | grep framehash)
[ "$n" != "$h" ] || { echo "eink style: the colour frame equals the e-ink one"; exit 1; }
c=$(EINK_CARD_COLOUR=1 ZINC_EINK=1 ZINC_FRAMEHASH=last "$ZINC" run $d 2>&1 | grep framehash)
[ -n "$c" ] && [ "$c" != "$h" ] && [ "$c" != "$n" ] || { echo "eink style: setEinkColour left the colours snapped ($c)"; exit 1; }
echo "eink style: ok"
