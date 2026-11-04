#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for engine in interp native quickjs; do
  case "$engine" in
    interp) set -- --interp ;;
    native) set -- --native ;;
    quickjs) set -- --engine quickjs ;;
  esac
  "$ZINC" run tests/golden/host/math_geometry.ts "$@" > "$tmp/out" 2> "$tmp/err"
  [ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
  grep -q 'math_geometry:.*PASS' "$tmp/out"
done
