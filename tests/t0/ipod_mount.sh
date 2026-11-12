#!/bin/sh
# Actual private UDisks transaction and codec with fake bus/sysfs only; no hardware or daemon.
set -eu
cd "${ZINC_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
c++ -std=c++17 -O1 -Wall -Wextra -Werror -fno-exceptions -fno-rtti -Iruntime/include tests/native/ipod_mount.cpp -o "$tmp/test"
timeout 5 "$tmp/test" "$tmp/sys"
