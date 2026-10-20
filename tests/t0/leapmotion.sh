#!/bin/sh
# Plugin boundary, explicit simulator, bounded ink and swept fruit collision. No hardware required.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() {
  if ! "$@" >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q 'all checks passed' "$tmp/log" || { cat "$tmp/log"; exit 1; }
}
run env ZINC_NATIVE=sim "$ZINC" run tests/data/leapmotion/model.ts --interp
run env ZINC_NATIVE=real ZINC_LEAP_LIBRARY="$tmp/missing.dylib" "$ZINC" run tests/data/leapmotion/missing.ts --interp
sdk='/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK/include'
if [ -f "$sdk/LeapC.h" ]; then
  c++ -std=c++17 -Wall -Wextra -Werror -dynamiclib -I"$sdk" tests/data/leapmotion/fake.cpp -o "$tmp/fake.dylib"
  run env ZINC_NATIVE=real ZINC_LEAP_LIBRARY="$tmp/fake.dylib" "$ZINC" run tests/data/leapmotion/native.ts --interp
  run env ZINC_NATIVE=real ZINC_LEAP_LIBRARY="$tmp/fake.dylib" "$ZINC" run tests/data/leapmotion/native.ts --engine quickjs
  run env ZINC_NATIVE=real ZINC_LEAP_LIBRARY="$tmp/fake.dylib" "$ZINC" run tests/data/leapmotion/exit.ts --interp
  run env ZINC_NATIVE=real ZINC_LEAP_LIBRARY="$tmp/fake.dylib" "$ZINC" run tests/data/leapmotion/exit.ts --engine quickjs
  ZINC_NATIVE=real "$ZINC" build tests/data/leapmotion/native.ts -o "$tmp/native" >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
  run env ZINC_LEAP_LIBRARY="$tmp/fake.dylib" "$tmp/native"
  run env -u ZINC_DETERMINISTIC ZINC_NATIVE=real LEAP_TEST_STALE=1 ZINC_LEAP_LIBRARY="$tmp/fake.dylib" "$ZINC" run tests/data/leapmotion/stale.ts --interp
else
  echo 'leapmotion: SDK not installed; native event fixture skipped (simulator and missing SDK checked)'
fi
echo 'leapmotion: all checks passed'
