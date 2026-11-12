#!/bin/sh
# Exact GPIO layer/API proof; never accesses devices or creates gpio-sim/configfs.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
c++ -std=c++20 -Wall -Wextra -Werror -I runtime/include tests/native/gpio.cpp -o "$tmp/sim"
timeout 5 "$tmp/sim"
if [ "$(uname -s)" = Linux ]; then
  c++ -std=c++20 -Wall -Wextra -Werror -I runtime/include tests/native/gpio_linux.cpp -o "$tmp/linux"
else
  for headers in "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/lib/libc/include; do
    if [ -f "$headers/any-linux-any/linux/gpio.h" ] && [ -d "$headers/aarch64-linux-any" ]; then
      c++ -std=c++20 -Wall -Wextra -Werror -I runtime/include -idirafter "$headers/any-linux-any" -idirafter "$headers/aarch64-linux-any" tests/native/gpio_linux.cpp -o "$tmp/linux"
      break
    fi
  done
fi
[ -x "$tmp/linux" ] || { echo 'gpio: Linux UAPI headers unavailable for syscall shim'; exit 77; }
timeout 5 "$tmp/linux"
ZINC_NATIVE=real ZINC_HEADLESS=1 timeout 15 "$ZINC" run --interp tests/data/gpio/public.ts > "$tmp/public.log" 2>&1
grep -q '^gpio public ok$' "$tmp/public.log" || { cat "$tmp/public.log"; exit 1; }
