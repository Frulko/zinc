#!/bin/sh
# Pending offsets/animation/row/restoration belong to current layout and node generation, on classic and Yoga.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for layout in classic rn; do
  mkdir "$tmp/$layout"
  cp tests/data/scroll_request/main.ts tests/data/scroll_request/windows.ts "$tmp/$layout/"
  printf '{"entry":"main.ts","ui":{"layout":"%s"}}\n' "$layout" >"$tmp/$layout/zinc.json"
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_SIZE=320x300 timeout 45 "$ZINC" run "$tmp/$layout" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
    grep -q '^scroll requests: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_FRAMES=12 ZINC_SIZE=320x300 timeout 45 "$ZINC" run "$tmp/$layout/windows.ts" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
    grep -q '^scroll windows: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
