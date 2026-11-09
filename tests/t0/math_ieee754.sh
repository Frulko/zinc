#!/bin/sh
# Math.sin, cos, tan, exp, log, pow and atan2 give the same bits on every CPU and libc (ZN-703): 10000 arguments each print the
# lines of tests/golden/math/ieee754.out.gz (Node 24's output, see the program's header) on the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
gunzip -c tests/golden/math/ieee754.out.gz > "$tmp/want" || exit 2
fail=0
for engine in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 "$ZINC" run tests/golden/math/ieee754.ts $engine > "$tmp/out" 2> "$tmp/err"
  if ! cmp -s "$tmp/want" "$tmp/out"; then
    echo "math_ieee754 ($engine): $(diff "$tmp/want" "$tmp/out" | grep -c '^>') lines differ, first: $(diff "$tmp/want" "$tmp/out" | sed -n 2,3p | tr '\n' ' ') $(tail -2 "$tmp/err" | tr '\n' ' ')"
    fail=1
  fi
done
[ $fail = 0 ] && echo "math_ieee754: ok"
exit $fail
