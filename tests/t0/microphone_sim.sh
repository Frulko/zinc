#!/bin/sh
# zinc:microphone without native code (ZINC_NATIVE=sim: plugins/microphone/native/microphone.sim.ts): the fake microphone's session prints
# the frozen lines of the native plugin (tests/t1/microphone.sh), sample hashes and levels included, so the stand-in makes the same samples.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_NATIVE=sim ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/golden/host/microphone_session.ts 2>/dev/null)
[ "$out" = "$(cat tests/golden/host/microphone_session.out)" ] || { echo "the simulated microphone session differs: $(echo "$out" | diff tests/golden/host/microphone_session.out - | head -6)"; exit 1; }
