#!/bin/sh
# zinc:hash (ZN-698, tests/data/hash_sha256): the SHA-256 test vectors of bytes and of files read in blocks (one million 'a'), and a missing file's
# error, with the same output on the interpreter, the default engine, QuickJS and AOT.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for e in "--interp" "" "--engine quickjs"; do
  ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/data/hash_sha256/main.ts $e > "$t/o" 2>&1
  cmp -s "$t/o" tests/data/hash_sha256/expected.txt || { echo "hash_sha256 ($e): $(cat "$t/o")"; exit 1; }
done
timeout 120 "$ZINC" build tests/data/hash_sha256/main.ts -o "$t/bin" >/dev/null 2>&1 && timeout 60 "$t/bin" > "$t/o" 2>&1
cmp -s "$t/o" tests/data/hash_sha256/expected.txt || { echo "hash_sha256 (aot): $(cat "$t/o")"; exit 1; }
echo "hash_sha256: ok"
