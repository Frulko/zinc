#!/bin/sh
# Checked Dyn copies distinguish the admitted null and undefined tags before typed storage.
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
build=${BUILD:-$(dirname "$ZINC")}
"${CXX:-c++}" -std=c++20 -O0 -Wall -Wextra -Werror -Iinclude -Isrc tests/native/checked_nullish/schema.cpp "$build/libzn_frontend.a" "$build/libzn_native.a" "$build/libzn_i18n.a" "$build/libzn_yyjson.a" "$build/libzn_platform.a" "$build/libzn_regexp.a" "$build/libzn_sha256.a" -o "$tmp/schema"
timeout 5 "$tmp/schema" > "$tmp/schema.out"
for engine in interp native quickjs; do
  case "$engine" in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 40 "$ZINC" run tests/data/checked_nullish/main.ts "$@" > "$tmp/$engine.out" 2> "$tmp/$engine.err" || { cat "$tmp/$engine.err"; exit 1; }
  if [ "$engine" = native ] && grep -q 'interpreting' "$tmp/$engine.err"; then cat "$tmp/$engine.err"; exit 1; fi
  printf 'checked nullish: pass\n' | diff -u - "$tmp/$engine.out"
done
