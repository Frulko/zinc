#!/bin/sh
# The style keys of what was class-only (ZN-774.18, docs/ui.md "Object styles and StyleSheet"): tests/golden/style-keys/objects.tsx gives zIndex, fontStyle,
# textTransform, textDecorationLine/Color/Style, textShadowColor/Offset/Radius, fontWeight 100 to 900, the alpha and transparent of color, borderColor and
# shadowColor, shadowLevel, pointerEvents and cursor as style objects (static, and decided at run time), classes.tsx the same cells through classes:
# both render the recorded frame and print the same hit under a pointerEvents none overlay and the same cursor.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SIZE=640x330 ZINC_SCALE=1 ZINC_FRAMEHASH=last
d=tests/golden/style-keys
want=$(cat $d/frame.hash)
fail=0
for f in objects classes; do
  out=$("$ZINC" run $d/$f.tsx 2>&1)
  h=$(echo "$out" | grep framehash)
  [ "$h" = "$want" ] || { echo "style keys $f: $h, recorded $want"; echo "$out" | tail -5; fail=1; }
  echo "$out" | grep -q "pointer under the overlay: below it" || { echo "style keys $f: the overlay with pointer events none took the hit"; fail=1; }
  echo "$out" | grep -q "cursor: 2" || { echo "style keys $f: the cursor is not the pointer (2)"; fail=1; }
done
[ $fail -eq 0 ] && echo "style keys: ok"
exit $fail
