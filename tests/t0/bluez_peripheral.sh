#!/bin/sh
# Production export callbacks and owned socketpairs only; no bus, daemon or radio.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
c++ -std=c++17 -fno-exceptions -fno-rtti -Wall -Wextra -Werror -Iruntime/include tests/native/radios/bluez_peripheral.cpp -o "$tmp/peripheral"
timeout 5 "$tmp/peripheral"

python3 tests/native/radios/ble-public-fixture.py "$tmp/public"
ZINC_HEADLESS=1 timeout 5 "$ZINC" run --interp "$tmp/public/ble-peripheral-public.ts"
