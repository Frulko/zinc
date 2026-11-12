#!/bin/sh
# Only normal try/catch exits narrow locals or initialize a constructor's fields.
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for engine in interp native quickjs; do
  case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 40 "$ZINC" run tests/data/try_flow/main.ts "$@" > "$tmp/$engine.out" 2> "$tmp/$engine.err" || { cat "$tmp/$engine.err"; exit 1; }
  printf 'try flow: pass\n' | diff -u - "$tmp/$engine.out"
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 40 "$ZINC" run tests/data/try_flow/machine-main.ts "$@" > "$tmp/machine-$engine.out" 2> "$tmp/machine-$engine.err" || { cat "$tmp/machine-$engine.err"; exit 1; }
  printf 'try machine flow: pass\n' | diff -u - "$tmp/machine-$engine.out"
done
for source in tests/data/try_flow/*.ts; do
  case "$source" in tests/data/try_flow/main.ts|tests/data/try_flow/machine-main.ts) continue;; esac
  if LANG=en timeout 10 "$ZINC" check "$source" > "$tmp/negative.log" 2>&1; then echo "accepted unsafe flow: $source"; exit 1; fi
  expected='Z0103|Z0111'
  [ "$source" != tests/data/try_flow/multiple-numbers.ts ] || expected='Z0107'
  grep -Eq "$expected" "$tmp/negative.log" || { cat "$tmp/negative.log"; exit 1; }
done
