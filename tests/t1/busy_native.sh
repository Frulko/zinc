#!/bin/sh
# Animated's native driver keeps moving while the program's thread is blocked (ZN-364.01 #1): tests/data/busy_native slides a box for 3 s and
# busy-waits 1 s at frame 30. On a real clock with the render thread on (headless: the null display presents on it too), the compositor presents
# the box moved on during the wait: ZINC_PROFILE=json "screen" (every present of any thread) has its longest gap near a frame and dozens of
# compositor ticks. The same program animated from the program (BUSY_SCRIPT=1) shows the whole second frozen: the control.
# Measures time: run it alone, not while trees build.
cd "$(dirname "$0")/../.." || exit 2
screen() {   # screen <BUSY_SCRIPT>: "gap_max ticks" of the run
  env -u ZINC_DETERMINISTIC BUSY_SCRIPT=$1 ZINC_RENDER_THREAD=1 ZINC_HEADLESS=1 ZINC_PROFILE=json ZINC_FRAMES=60 timeout 60 "$ZINC" run tests/data/busy_native/main.tsx 2>&1 |
    sed -n 's/^zinc profile json: //p' | python3 -c 'import json,sys; s=json.load(sys.stdin)["screen"]; print(s["gap_max"], s["ticks"])'
}
set -- $(screen 0)
[ -n "$1" ] || { echo "busy_native: no profile"; exit 1; }
[ "$1" -le 100000 ] && [ "$2" -ge 30 ] || { echo "busy_native: native driver: longest gap ${1} us, ${2} compositor ticks while the program was busy"; exit 1; }
gap=$1
set -- $(screen 1)
[ "${1:-0}" -ge 900000 ] || { echo "busy_native: the program-driven control shows no frozen second (${1} us): the test measures nothing"; exit 1; }
echo "busy_native: ok (longest gap ${gap} us with the native driver, ${1} us from the program)"
