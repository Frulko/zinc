#!/bin/sh
# An optional chain short-circuits as a whole (ZN-1040, tests/golden/chain/optional_chain.ts): `a.b?.m.get('x')`, `a.b?.list[1]`,
# `a.b?.name().toUpperCase()` are undefined when a.b is null, and `m?.get(k) ?? d` gives d when there is no Map; the interpreter, the
# compiled program and QuickJS print Node's output. A member that may be null after the chain, or a chain closed by parentheses, is refused.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
f=tests/golden/chain/optional_chain
fail=0
for engine in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  timeout 120 "$ZINC" run $f.ts $engine 2>&1 | diff - $f.out >"$tmp/d" || { echo "$engine: $(head -5 "$tmp/d")"; fail=1; }
done
out=$(timeout 60 "$ZINC" check ${f}_refused.ts 2>&1) && { echo "the refused chains were accepted"; fail=1; }
[ "$(printf '%s\n' "$out" | grep -c 'error Z0107')" = 2 ] || { echo "the refused chains: $out"; fail=1; }
exit $fail
