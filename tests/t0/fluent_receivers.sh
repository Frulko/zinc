#!/bin/sh
# A bounded functional regression: the checker must terminate on fluent prefixes.
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
timeout 5 "$ZINC" check tests/data/fluent_receivers/main.ts > "$tmp/check.out" 2>&1 || { cat "$tmp/check.out"; exit 1; }
timeout 5 "$ZINC" check tests/data/fluent_receivers/method-value-check.ts > "$tmp/method-check.out" 2>&1 || { cat "$tmp/method-check.out"; exit 1; }
for engine in interp native quickjs; do
  case "$engine" in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 40 "$ZINC" run tests/data/fluent_receivers/main.ts "$@" > "$tmp/$engine.out" 2> "$tmp/$engine.err" || { cat "$tmp/$engine.err"; exit 1; }
  if [ "$engine" = native ] && grep -q 'interpreting' "$tmp/$engine.err"; then cat "$tmp/$engine.err"; exit 1; fi
  printf 'fluent receivers: pass\n' | diff -u - "$tmp/$engine.out"
done
for source in tests/data/fluent_receivers/*.ts; do
  case "$source" in */main.ts|*/method-value-check.ts) continue;; esac
  if LANG=en timeout 5 "$ZINC" check "$source" > "$tmp/negative.log" 2>&1; then echo "accepted invalid receiver: $source"; exit 1; fi
  case "$source" in
    */stale-flow.ts) expected=Z0107;;
    */private.ts) expected=Z0117;;
    */arity.ts) expected=Z0104;;
    */missing.ts) expected=Z0106;;
    */noncallable.ts) expected=Z0105;;
    *) expected='Z0103|Z0111';;
  esac
  grep -Eq "$expected" "$tmp/negative.log" || { cat "$tmp/negative.log"; exit 1; }
done
