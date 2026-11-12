#!/bin/sh
# Production BlueZ codec/state, permission boundary and public callbacks; no bus/daemon/radio.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
c++ -std=c++20 -Wall -Wextra -Werror -Iruntime/include tests/native/radios/bluez.cpp -o "$tmp/bluez"
timeout 5 "$tmp/bluez"
c++ -std=c++20 -Wall -Wextra -Werror -Iruntime/include tests/native/radios/bluez_gatt.cpp -o "$tmp/gatt"
timeout 5 "$tmp/gatt"
"$ZINC" native-gen plugins/ble/native/ble.spec.ts "$tmp" > "$tmp/native-gen.log" 2>&1
c++ -std=c++20 -O0 -Wall -Wextra -Werror -Wno-unused-variable -pthread \
  -DZN_NO_MIMALLOC -DZRT_HOSTED_CPP -I"$tmp" -Iruntime -Iruntime/include -Iinclude \
  tests/native/radios/ble_permission.cpp runtime/zrt.cpp runtime/host.cpp \
  targets/null/hal_null.cpp targets/common/hal_posix.cpp -o "$tmp/permission"
timeout 5 "$tmp/permission"
python3 tests/native/radios/ble-public-fixture.py "$tmp/public"
ZINC_HEADLESS=1 timeout 5 "$ZINC" run --interp "$tmp/public/ble-reentrant.ts"

ZINC_HEADLESS=1 timeout 5 "$ZINC" run --interp "$tmp/public/ble-gatt-public.ts"
