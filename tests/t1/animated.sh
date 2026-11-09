#!/bin/sh
# zinc:ui/animated (ZN-364): easing curves, springs (tension/friction, bounciness/speed, stiffness/damping, critical) and decay equal React Native 0.76's
# values within 1e-6 (the reference numbers in tests/golden/animated/main.ts come from React Native's own Easing.js, bezier.js, SpringConfig.js and the
# closed forms of SpringAnimation and DecayAnimation); timing, sequence, parallel, delay, loop, interpolate (ranges, clamp, identity, colours) and add/multiply.
# ANIMATED_NATIVE=1 runs it again with useNativeDriver: true on every animation (ZN-364.01 #3): the same output.
cd "$(dirname "$0")/../.." || exit 2
for native in 0 1; do
  out=$(ANIMATED_NATIVE=$native ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run tests/golden/animated 2>&1)
  [ "$out" = "$(cat tests/golden/animated/main.out)" ] || { echo "animated (native driver $native): $(echo "$out" | diff - tests/golden/animated/main.out | head -6)"; exit 1; }
done
echo "animated: ok"
