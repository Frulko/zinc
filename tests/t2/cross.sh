#!/bin/sh
# Docker-free cross build (ZN-029): on a clean ZINC_HOME the pinned zig is downloaded and verified, and `zinc build --target aarch64-linux`
# writes an aarch64 Linux executable (ELF, machine 183). The home is kept in build/tc-home between runs (the first run downloads about 50 MB).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="${ZINC_TEST_HOME:-$PWD/build/tc-home}"
unset ZINC_ZIG
"$ZINC" build --target aarch64-linux ../tests/bench/kernels/fib.ts -o "$tmp/fib_arm" 2>"$tmp/err" || { echo "cross build failed: $(tail -c 300 "$tmp/err")"; exit 1; }
python3 - "$tmp/fib_arm" <<'PY' || { echo "the output is not an aarch64 Linux executable"; fail=1; }
import struct, sys
d = open(sys.argv[1], 'rb').read(64)
assert d[:4] == b'\x7fELF' and d[4] == 2 and struct.unpack('<H', d[18:20])[0] == 183  # ELF64, EM_AARCH64
PY
[ -f "$ZINC_HOME/toolchains/zig-"*"-0.15.2/SHA256" ] || { echo "the verified checksum was not recorded"; fail=1; }
exit $fail
