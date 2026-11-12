#!/bin/sh
# Dynamic backward search shares one frontend helper across interpreter and AOT.
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
timeout 10 "$ZINC" check tests/data/dyn_lastindex/main.ts > "$tmp/check" 2>&1 || { cat "$tmp/check"; exit 1; }
for engine in interp native quickjs; do
  case "$engine" in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  timeout 40 "$ZINC" run tests/data/dyn_lastindex/main.ts "$@" > "$tmp/$engine.out" 2> "$tmp/$engine.err" || { cat "$tmp/$engine.err"; exit 1; }
  if [ "$engine" = native ] && grep -q 'interpreting' "$tmp/$engine.err"; then cat "$tmp/$engine.err"; exit 1; fi
  printf 'dynamic lastIndexOf: pass\n' | diff -u - "$tmp/$engine.out"
done
