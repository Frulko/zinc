#!/bin/sh
# Hamlet: the attention hints, one tiny village per kind, headless on three engines.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1
for engine in "" "--interp" "--engine quickjs"; do
  case "$engine" in
    --interp) "$ZINC" run --interp tests/data/hamlet/hints.ts > "$tmp/out" 2> "$tmp/err" ;;
    "") "$ZINC" run tests/data/hamlet/hints.ts > "$tmp/out" 2> "$tmp/err" ;;
    *) "$ZINC" run tests/data/hamlet/hints.ts --engine quickjs > "$tmp/out" 2> "$tmp/err" ;;
  esac
  [ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
  grep -q 'hamlet hints: ALL PASS' "$tmp/out" || { cat "$tmp/out"; exit 1; }
done
echo 'hamlet_hints: PASS'
