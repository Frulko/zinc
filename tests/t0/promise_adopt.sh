#!/bin/sh
# then, catch and finally whose callback returns a promise (ZN-794, tests/golden/host/promise_adopt.ts): adopted or waited for, in Node's order, and
# fetch(u).then(r => r.text()) yields the text, on the interpreter, the compiled program and QuickJS, against tests/golden/host/promise_adopt.out.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
f=tests/golden/host/promise_adopt
fail=0
for engine in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  timeout 120 "$ZINC" run $f.ts $engine 2>/dev/null | diff - $f.out >"$tmp/d" || { echo "$engine: $(head -5 "$tmp/d")"; fail=1; }
done
exit $fail
