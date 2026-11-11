#!/bin/sh
# Exact upstream arithmetic and observable fallback behavior, with private test-only hit counters.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
build=$(dirname "${ZINC:-build/zinc}")
for lib in zn_qjs_ext zn_napi_qjs zn_quickjs zn_regexp zn_sha256; do
  [ -f "$build/lib$lib.a" ] || { echo "skipped: $build/lib$lib.a missing"; exit 77; }
done
r162=$(timeout 15 tools/test-lib three-0.162.0) || { echo "skipped: pinned r162 unavailable"; exit 77; }
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
c++ -std=c++20 -O3 -Wall -Wextra -ffp-contract=off -DZN_THREE_MATH_TEST \
  -I . -I include -I third_party -I third_party/quickjs-ng \
  tests/native/three_math.cpp plugins/three/native/qjs_math.cpp \
  "$build/libzn_qjs_ext.a" "$build/libzn_napi_qjs.a" "$build/libzn_quickjs.a" "$build/libzn_regexp.a" "$build/libzn_sha256.a" \
  -lpthread -o "$tmp/three_math" || exit 1
timeout 20 "$tmp/three_math" third_party/three/three.core.js tests/native/three_math.js 186 || exit 1
timeout 20 "$tmp/three_math" "$r162" tests/native/three_math.js 162 || exit 1

[ -x "${ZINC:-build/zinc}" ] || { echo "skipped: no engine for script hooks"; exit 77; }
for mode in 1 0; do
  bits=11111111111
  [ "$mode" = 1 ] || bits=00000000000
  out=$(ZINC_HEADLESS=1 ZINC_JS_ACCEL=$mode timeout 20 "${ZINC:-build/zinc}" run tests/data/three_math 2>&1) || { echo "$out"; exit 1; }
  for route in script-defined script-direct; do
    echo "$out" | grep -Fqx "$route $bits:1" || { echo "$out"; exit 1; }
  done
done
