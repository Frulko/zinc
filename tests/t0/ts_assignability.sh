#!/bin/sh
# Function and generic assignability that TypeScript accepts (ZN-1003, tests/golden/assign/ts_assignability.ts): a default-parameter function where
# fewer parameters are expected, `?.[`, resolve(undefined), an `any` parameter for an Error, a Map of a class as a Map of its interface, a catch
# callback that returns nothing; the interpreter, the compiled program and QuickJS print Node's output.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
f=tests/golden/assign/ts_assignability
fail=0
for engine in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  timeout 120 "$ZINC" run $f.ts $engine 2>&1 | diff - $f.out >"$tmp/d" || { echo "$engine: $(head -5 "$tmp/d")"; fail=1; }
done
exit $fail
