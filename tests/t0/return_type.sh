#!/bin/sh
# ReturnType keeps inferred model fields and callable constraints without erasing the result to any.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/return_type/main.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^return type: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
for bad in callable unknown arity shape property generic recursion overload; do
  case $bad in callable|unknown|shape) code=Z0103;; property|generic) code=Z0106;; arity|recursion) code=Z0109;; overload) code=Z0005;; esac
  if timeout 5 "$ZINC" check "tests/data/return_type/invalid-$bad.ts" >"$tmp/log" 2>&1; then echo "$bad: invalid ReturnType accepted"; exit 1; fi
  grep -q "$code" "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
grep -q 'function declarations without a body' "$tmp/log" || { cat "$tmp/log"; exit 1; }
