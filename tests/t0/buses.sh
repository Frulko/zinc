#!/bin/sh
# Shared bus lifecycle, real chip model and public generational handles; no hardware probes.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
c++ -std=c++20 -Wall -Wextra -Werror -I runtime/include tests/native/buses.cpp -o "$tmp/buses"
timeout 5 "$tmp/buses"
ZINC_NATIVE=real ZINC_HEADLESS=1 timeout 15 "$ZINC" run --interp tests/data/buses/public.ts > "$tmp/out" 2>&1
grep -q '^buses public ok$' "$tmp/out" || { cat "$tmp/out"; exit 1; }
# On macOS, use the already installed pinned Zig's Linux UAPI headers. Never download a tool for this check.
if [ "$(uname -s)" = Linux ]; then
  c++ -std=c++20 -Wall -Wextra -Werror -I runtime/include tests/native/buses_linux.cpp -o "$tmp/linux"
  timeout 5 "$tmp/linux"
else
  for headers in "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/lib/libc/include; do
    if [ -f "$headers/any-linux-any/linux/i2c.h" ] && [ -d "$headers/aarch64-linux-any" ]; then
      c++ -std=c++20 -Wall -Wextra -Werror -I runtime/include -idirafter "$headers/any-linux-any" -idirafter "$headers/aarch64-linux-any" tests/native/buses_linux.cpp -o "$tmp/linux"
      timeout 5 "$tmp/linux"
      break
    fi
  done
fi
[ -x "$tmp/linux" ] || { echo "buses: Linux UAPI headers unavailable for syscall shim"; exit 77; }
"$ZINC" native-gen plugins/i2c/native/i2c.spec.ts "$tmp" > "$tmp/gen-i2c.log" 2>&1
"$ZINC" native-gen plugins/spi/native/spi.spec.ts "$tmp" > "$tmp/gen-spi.log" 2>&1
c++ -std=c++20 -O0 -Wall -Wextra -Werror -Wno-unused-variable -pthread \
  -DZN_NO_MIMALLOC -DZRT_HOSTED_CPP -I"$tmp" -Iruntime -Iruntime/include -Iinclude \
  tests/native/buses_concurrent.cpp runtime/zrt.cpp runtime/host.cpp \
  targets/null/hal_null.cpp targets/common/hal_posix.cpp -o "$tmp/concurrent"
timeout 5 "$tmp/concurrent"
