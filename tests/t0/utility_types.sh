#!/bin/sh
# TypeScript's utility types (Partial, Required, Readonly, Pick, Omit, Record with literal keys; the checker's cases are in
# tests/golden/checker): one program prints the same line on the interpreter, the AOT build and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
prog=tests/golden/checker/ok/utility_types.ts
want='x 1999 a t a 3 x'
fail=0
for engine in --interp "--engine quickjs"; do
  out=$(ZINC_HEADLESS=1 "$ZINC" run "$prog" $engine 2>"$tmp/err")
  [ "$out" = "$want" ] || { echo "utility_types ($engine): $out $(tail -3 "$tmp/err" | tr '\n' ' ')"; fail=1; }
done
"$ZINC" build "$prog" -o "$tmp/u" >"$tmp/build" 2>&1 || { echo "utility_types: zinc build failed: $(tail -3 "$tmp/build" | tr '\n' ' ')"; fail=1; }
[ -x "$tmp/u" ] && { out=$("$tmp/u" 2>&1); [ "$out" = "$want" ] || { echo "utility_types (aot): $out"; fail=1; }; }
[ $fail = 0 ] && echo "utility_types: ok"
exit $fail
