#!/bin/sh
# Small Intl formatting/validation stage; AOT and size proofs are recorded in ZN-161.03.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 LC_ALL=en_US.UTF-8 TZ=UTC
main=portable
[ "$(uname -s)" = Darwin ] && main=main
${CXX:-c++} -std=c++17 -Iinclude -Isrc tests/data/intl_format/native.cpp -o "$tmp/native"
timeout 5 "$tmp/native"
for name in "$main" reject; do
  timeout 10 "$ZINC" check "tests/data/intl_format/$name.ts" >"$tmp/check" 2>&1 || { cat "$tmp/check"; exit 1; }
  for engine in '--interp' '--engine quickjs'; do
    # shellcheck disable=SC2086
    timeout 10 "$ZINC" run "tests/data/intl_format/$name.ts" $engine >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
    diff -u "tests/data/intl_format/$name.out" "$tmp/out"
  done
done
if timeout 10 "$ZINC" check tests/data/intl_format/mixed-invalid.ts >"$tmp/invalid" 2>&1; then echo 'non-Dyn array mixture unexpectedly accepted'; exit 1; fi
grep -q Z0103 "$tmp/invalid" || { cat "$tmp/invalid"; exit 1; }
timeout 15 "$ZINC" mem tests/data/intl_format/lifetime.ts --json --check-leaks >"$tmp/mem" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
echo 'intl_format: decimal, Gregorian, locale, zone and bound callback checks pass'
