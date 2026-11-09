#!/bin/sh
# Source glyph hits differ from static selection caret units on all three engines.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 ZINC_SIZE=400x340 timeout 45 "$ZINC" run tests/data/text_offset/main.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^text offset: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
