#!/bin/sh
# Response.bytes() and arrayBuffer() are byte exact for any body (tests/golden/host/net_fetch_bytes.ts): a surrogate pair (ED A2 85 ED BB AF),
# invalid UTF-8 with a NUL, a lone ED A0 80 and 2 MB of random bytes with a pair inside, on the interpreter, QuickJS and the compiled program. Port 18853.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export NET_FETCH_DIR=$tmp
printf 'S\355\242\205\355\273\257Z' >"$tmp/pair"
printf 'a\377\200\000\300\257\355\240z' >"$tmp/invalid"
printf '\355\240\200' >"$tmp/lone"
{ head -c 1000000 /dev/urandom; printf '\355\242\205\355\273\257'; head -c 1000000 /dev/urandom; } >"$tmp/big"
want="pair 8 8 8 true
invalid 9 9 9 true
lone 3 3 3 true
big 2000006 2000006 2000006 true"
fail=0
check() { [ "$1" = "$want" ] || { echo "$2: $1"; fail=1; }; }
check "$(timeout 120 "$ZINC" run --interp tests/golden/host/net_fetch_bytes.ts 2>&1)" interpreter
check "$(timeout 120 "$ZINC" run tests/golden/host/net_fetch_bytes.ts --engine quickjs 2>&1)" QuickJS
if "$ZINC" build tests/golden/host/net_fetch_bytes.ts -o "$tmp/app" >"$tmp/log" 2>&1; then
  check "$(timeout 120 "$tmp/app" 2>&1)" compiled
else echo "the program does not build: $(tail -c 300 "$tmp/log")"; fail=1; fi
exit $fail
