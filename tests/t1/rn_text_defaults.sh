#!/bin/sh
# React Native's text defaults (ZN-385, tests/golden/rn-text-defaults): under the react-native preset a Text without fontSize is 14 px and
# StyleSheet.hairlineWidth is 0.4 rounded to the device pixel (1 at pixel scale 1, 0.5 at 2, 1/3 at 3: ZINC_SCALE in headless runs); without the
# preset the Text keeps zinc:ui's 16 px.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_FRAMES=5
g=tests/golden/rn-text-defaults
fail=0
for s in 1 2 3; do
  got=$(ZINC_SCALE=$s "$ZINC" run $g 2>&1 | tail -1)
  want=$(sed -n "${s}p" $g/main.out)
  [ "$got" = "$want" ] || { echo "rn text defaults at scale $s: '$got', want '$want'"; fail=1; }
done
got=$("$ZINC" run $g/plain 2>&1 | tail -1)
[ "$got" = "text 16" ] || { echo "without the preset: '$got', want 'text 16'"; fail=1; }
[ $fail -eq 0 ] && echo "rn text defaults: ok"
exit $fail
