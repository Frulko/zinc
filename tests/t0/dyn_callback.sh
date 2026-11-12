#!/bin/sh
# Generated Dyn callbacks preserve exact parameter and result types.
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1
build=${BUILD:-$(dirname "$ZINC")}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"${CXX:-c++}" -std=c++20 -O0 -Wall -Wextra -Werror -Iinclude -Isrc \
  tests/native/dyn_callback/types.cpp "$build/libzn_frontend.a" \
  "$build/libzn_native.a" "$build/libzn_i18n.a" "$build/libzn_yyjson.a" \
  "$build/libzn_platform.a" "$build/libzn_regexp.a" "$build/libzn_sha256.a" -o "$tmp/types"
timeout 5 "$tmp/types"
for fixture in main subclass; do
  timeout 10 "$ZINC" check "tests/data/dyn_callback/$fixture.ts" > "$tmp/check" 2>&1 || { cat "$tmp/check"; exit 1; }
  for engine in interp native quickjs; do
    case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
    timeout 20 "$ZINC" run "tests/data/dyn_callback/$fixture.ts" "$@" > "$tmp/out" 2> "$tmp/err" || { cat "$tmp/err"; exit 1; }
    diff -u "tests/data/dyn_callback/$fixture.out" "$tmp/out"
  done
done
for invalid in call result subclass; do
  if timeout 5 "$ZINC" check "tests/data/dyn_callback/invalid-$invalid.ts" > "$tmp/err" 2>&1; then
    echo "invalid $invalid accepted"; exit 1
  fi
  grep -q Z0103 "$tmp/err" || { cat "$tmp/err"; exit 1; }
done
