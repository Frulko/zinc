#!/bin/sh
# An idle React Native screen costs nothing per frame (tests/golden/rn-idle): with useWindowDimensions, KeyboardAvoidingView, icons and a stopped spinner
# on screen, the frames after the first are kept (paint p50 0.00 ms: no paint at all) and 200 of them allocate nothing (the probe's own closure only).
cd "$(dirname "$0")/../golden/rn-idle" || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=360x400 ZINC_FRAMES=300 ZINC_PROFILE=1 "$ZINC" run main.tsx 2>&1)
fail=0
echo "$out" | grep -q '^200 idle frames: [0-9] allocations' || { echo "rn_idle: $(echo "$out" | grep 'idle frames')"; fail=1; }
echo "$out" | grep -q 'zinc profile: paint p50=0.00 ' || { echo "rn_idle: frames are painted while idle: $(echo "$out" | grep 'profile: paint')"; fail=1; }
[ $fail -eq 0 ] && echo "rn idle: ok"
exit $fail
