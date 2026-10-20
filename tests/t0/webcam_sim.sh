#!/bin/sh
# zinc:camera without native code (ZINC_NATIVE=sim: plugins/camera/native/camera.sim.ts): the fake camera's session prints the frozen lines
# of the native plugin (tests/t1/webcam.sh), snapshot hashes included, so the stand-in draws the same pattern.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_NATIVE=sim ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/golden/host/webcam_session.ts 2>/dev/null)
[ "$out" = "$(cat tests/golden/host/webcam_session.out)" ] || { echo "the simulated camera session differs: $(echo "$out" | diff tests/golden/host/webcam_session.out - | head -6)"; exit 1; }
