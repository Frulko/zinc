#!/bin/sh
# The bulk byte rows (ZN-1019, tests/data/bytes_bulk): utf8Encode, randomBytes, fs.readBytes in one host call, fs.writeBytesAt (in place, past the
# end, a new file) and the errors, with the same output on the interpreter, the default engine, QuickJS and AOT.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for e in "--interp" "" "--engine quickjs"; do
  ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/data/bytes_bulk/main.ts $e > "$t/o" 2>&1
  cmp -s "$t/o" tests/data/bytes_bulk/expected.txt || { echo "bytes_bulk ($e): $(cat "$t/o")"; exit 1; }
done
timeout 120 "$ZINC" build tests/data/bytes_bulk/main.ts -o "$t/bin" >/dev/null 2>&1 && timeout 60 "$t/bin" > "$t/o" 2>&1
cmp -s "$t/o" tests/data/bytes_bulk/expected.txt || { echo "bytes_bulk (aot): $(cat "$t/o")"; exit 1; }
echo "bytes_bulk: ok"
