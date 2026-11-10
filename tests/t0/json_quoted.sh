#!/bin/sh
# Quoted property identity and generated JSON keys stay exact on each engine.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/json_quoted/main.ts $engine >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
  diff -u tests/data/json_quoted/main.out "$tmp/out"
done
for bad in function union property dynamic; do
  case $bad in property) code=Z0106;; dynamic) code=Z0113;; *) code=Z0005;; esac
  if LANG=en timeout 5 "$ZINC" check "tests/data/json_quoted/invalid-$bad.ts" >"$tmp/log" 2>&1; then echo "$bad unexpectedly accepted"; exit 1; fi
  grep -q "$code" "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
echo 'quoted JSON: pass'
