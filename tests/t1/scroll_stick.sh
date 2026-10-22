#!/bin/sh
# <ScrollView stickToBottom>: it follows the end as rows are added while it shows it, stays put once scrolled up, follows again when brought back to the
# end; a ScrollView without the prop stays at the top (tests/golden/scroll-stick). The interpreter runs the session, the AOT engine the same frames.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/scroll-stick
for e in --interp ""; do
  out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=16 "$ZINC" run $e $d 2>/dev/null)
  [ "$out" = "$(cat $d/main.out)" ] || { echo "scroll stick ${e:-aot}: $(echo "$out" | diff - $d/main.out | head -8)"; exit 1; }
done
echo "scroll stick: ok"
