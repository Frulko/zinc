#!/bin/sh
# Shared layer entry/exit and live preference changes, including kit focus ownership.
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=14 timeout 45 "$ZINC" run tests/data/ui_layer_reduced/main.tsx $engine >"$tmp/log" 2>&1; then
    cat "$tmp/log"; exit 1
  fi
  grep -qx 'layer reduced motion: ok' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
echo 'layer reduced motion: ok'
