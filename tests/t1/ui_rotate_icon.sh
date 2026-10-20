#!/bin/sh
# An icon inside a rotated view paints turned (tests/golden/ui-rotate-icon): the frames at 0 and 90 degrees differ, 0 and 360 match.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_DETERMINISTIC=1 ZINC_SIZE=80x80 ZINC_SCALE=1 ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_FRAMEHASH=last
at() { ROT=$1 "$ZINC" run tests/golden/ui-rotate-icon 2>&1 | grep framehash; }
a=$(at 0) b=$(at 90) c=$(at 360)
[ -n "$a" ] && [ "$a" != "$b" ] || { echo "ui rotate icon: the icon does not turn ($a, $b)"; exit 1; }
[ "$a" = "$c" ] || { echo "ui rotate icon: a full turn does not come back ($a, $c)"; exit 1; }
echo "ui rotate icon: ok"
