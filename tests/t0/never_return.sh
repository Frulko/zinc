#!/bin/sh
# Never has no normal result; throws still reach catch/finally on every engine.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for fixture in tests/data/never_return/unused tests/data/never_return/main tests/data/open_record_methods/type-namespace; do
  timeout 5 "$ZINC" check "$fixture.ts" >"$tmp/check" 2>&1 || { cat "$tmp/check"; exit 1; }
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 timeout 20 "$ZINC" run "$fixture.ts" $engine >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
    diff -u "$fixture.out" "$tmp/out"
  done
done
for invalid in number null empty fallthrough partial assertion resolve slot method method-arg method-reverse; do
  if LANG=en timeout 5 "$ZINC" check "tests/data/never_return/invalid-$invalid.ts" >"$tmp/err" 2>&1; then
    echo "$invalid unexpectedly accepted"; exit 1
  fi
  case "$invalid" in
    fallthrough|partial) code=Z0110 ;;
    assertion|slot) code=Z0005 ;;
    method*) code=Z0114 ;;
    *) code=Z0103 ;;
  esac
  grep -q "$code" "$tmp/err" || { cat "$tmp/err"; exit 1; }
done
echo 'never return: pass'
