#!/bin/sh
# Exact Symbol/iteration stage regressions; AOT uses the same fixtures and goldens in the task proof.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_STEPS=0
for name in main dynamic clone; do
  timeout 5 "$ZINC" check "tests/data/symbols/$name.ts" >"$tmp/check" 2>&1 || { cat "$tmp/check"; exit 1; }
  for engine in '--interp' '--engine quickjs'; do
    # shellcheck disable=SC2086
    timeout 10 "$ZINC" run "tests/data/symbols/$name.ts" $engine >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
    diff -u "tests/data/symbols/$name.out" "$tmp/out"
  done
done
timeout 10 "$ZINC" run tests/data/symbols/native.js --engine quickjs >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
diff -u tests/data/symbols/native.out "$tmp/out"
timeout 10 "$ZINC" mem tests/data/symbols/lifetime.ts --json --check-leaks >"$tmp/mem" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
for invalid in new worker-symbol worker-iterator; do
  if timeout 5 "$ZINC" check "tests/data/symbols/$invalid.ts" >"$tmp/err" 2>&1; then echo "$invalid unexpectedly accepted"; exit 1; fi
  case "$invalid" in
    new) grep -q Z0105 "$tmp/err" ;;
    *) grep -q Z5012 "$tmp/err" ;;
  esac || { cat "$tmp/err"; exit 1; }
done
if timeout 5 "$ZINC" run tests/data/symbols/checked-symbol.ts --interp >"$tmp/out" 2>"$tmp/err"; then echo 'forged Symbol unexpectedly accepted'; exit 1; fi
grep -q 'Value is not a symbol' "$tmp/err" || { cat "$tmp/err"; exit 1; }
echo 'symbols: primitive keys, iteration, close ordering and clone boundaries pass'
