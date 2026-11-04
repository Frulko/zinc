#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
cat > "$tmp/expected" <<'OUT'
single true 1
keep true 2
multiline true 2
multi-submit true 3
legacy true 4
next true true 5
raw true
metadata 200 250 easeOut
done true true
OUT
for engine in interp aot quickjs; do
  case "$engine" in interp) set -- --interp ;; aot) set -- ;; quickjs) set -- --engine quickjs ;; esac
  if ! env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_PLATFORM=ios ZINC_FRAMES=12 "$ZINC" run tests/data/input_submit "$@" > "$tmp/out" 2> "$tmp/err"; then cat "$tmp/err"; exit 1; fi
  diff -u "$tmp/expected" "$tmp/out"
done
echo 'input_submit: single/multiline policies, focus transfer, Done and keyboard timing on all engines'
