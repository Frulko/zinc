#!/bin/sh
# Method references preserve JavaScript receiver rules and structural aliases.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for fixture in tests/data/open_record_methods/main tests/data/open_record_methods/borrowed tests/data/open_record_methods/remaining-borrowed tests/data/open_record_methods/optional tests/data/open_record_methods/remaining-optional-any tests/golden/run/open_record_writes; do
  timeout 5 "$ZINC" check "$fixture.ts" >"$tmp/check" 2>&1 || { cat "$tmp/check"; exit 1; }
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 timeout 20 "$ZINC" run "$fixture.ts" $engine >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
    diff -u "$fixture.out" "$tmp/out"
  done
done
timeout 5 "$ZINC" check tests/data/open_record_methods/type-namespace.ts >"$tmp/check" 2>&1 || { cat "$tmp/check"; exit 1; }
for invalid in unknown optional; do
  if LANG=en timeout 5 "$ZINC" check "tests/data/open_record_methods/invalid-$invalid.ts" >"$tmp/err" 2>&1; then
    echo "$invalid call unexpectedly accepted"; exit 1
  fi
  grep -q Z0105 "$tmp/err" || { cat "$tmp/err"; exit 1; }
done
for invalid in value-type unused-alias cycle-alias; do
  if LANG=en timeout 5 "$ZINC" check "tests/data/open_record_methods/invalid-$invalid.ts" >"$tmp/err" 2>&1; then
    echo "$invalid unexpectedly accepted"; exit 1
  fi
  case "$invalid" in
    cycle-alias) grep -q 'refers to itself' "$tmp/err" ;;
    *) grep -q Z0101 "$tmp/err" ;;
  esac || { cat "$tmp/err"; exit 1; }
done
echo 'open record methods: pass'
