#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
printf 'translation true\ncolour true\nsize true\nchildren true\n' > "$tmp/expected"
for engine in interp aot quickjs; do
  case "$engine" in interp) set -- --interp ;; aot) set -- ;; quickjs) set -- --engine quickjs ;; esac
  env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=16 "$ZINC" run tests/data/react_paint_layout "$@" > "$tmp/out" 2> "$tmp/err" || { cat "$tmp/err"; exit 1; }
  diff -u "$tmp/expected" "$tmp/out"
done
echo 'react_paint_layout: paint-only commits preserve layout; resize and child changes invalidate on all engines'
