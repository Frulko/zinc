#!/bin/sh
# zinc sim (ZN-295.01): the dice of examples/boards/s3-matrix shaken by a scenario (set-control, wait-serial, advance, expect-frame, take-screenshot, expect-pixel); a failing step exits 1 with the virtual
# time and leaves the last frame as a PNG; the Wokwi-shaped steps that need pins or buses say so instead of passing.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
out=$("$ZINC" sim ../examples/boards/s3-matrix/dice/scenarios/shake.yaml 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q "^dice shake and roll: ok 8 steps" || { echo "unexpected: $out"; exit 1; }
out=$("$ZINC" sim tests/golden/sim/prog/fails.yaml --out "$tmp" 2>&1); rc=$?
[ $rc -eq 1 ] || { echo "a failing step must exit 1, got $rc"; exit 1; }
echo "$out" | grep -q "FAIL step 3 (expect-frame) at t=" || { echo "the failure does not name step and time: $out"; exit 1; }
[ -s "$tmp/fail-step-3.png" ] || { echo "no last frame was written"; exit 1; }
cat > "$tmp/pin.yaml" <<'Y'
project: ../../zinc/examples/boards/s3-matrix/dice
steps:
  - expect-pin: { part-id: mcu, pin: GPIO2, value: 1 }
Y
sed -i.bak "s|^project: .*|project: $(pwd)/../examples/boards/s3-matrix/dice|" "$tmp/pin.yaml"
out=$("$ZINC" sim "$tmp/pin.yaml" 2>&1) && { echo "expect-pin must not pass on a program without pins"; exit 1; }
echo "$out" | grep -q "does not report pins" || { echo "expect-pin message: $out"; exit 1; }
echo "sim_program: ok"
