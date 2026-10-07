#!/bin/sh
# zinc:script on the engine's own QuickJS-ng (ZN-103): the conformance programs script_basic.ts and script_async.ts (eval, values in and out, host functions, function handles, errors with
# their lines, time and memory limits, promises) print their frozen output interpreted and as an AOT program that links the QuickJS module.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for n in script_basic script_async; do
  "$ZINC" run ../tests/conformance/$n.ts 2>&1 | diff -q - ../tests/conformance/$n.out >/dev/null || { echo "$n differs from its frozen output"; fail=1; }
  "$ZINC" build ../tests/conformance/$n.ts -o "$tmp/$n" >"$tmp/b.log" 2>&1 && "$tmp/$n" 2>&1 | diff -q - ../tests/conformance/$n.out >/dev/null || { echo "$n differs as an AOT program: $(head -c 300 "$tmp/b.log")"; fail=1; }
done
exit $fail
