#!/bin/sh
# Reset compositor samples without committing them as base styles; equal writes stay idle.
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  for compositor in 0 1; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=7 ZINC_COMPOSITOR=$compositor timeout 60 "$ZINC" run tests/data/ui_animation_reset/main.ts $engine >"$tmp/log" 2>&1; then
      cat "$tmp/log"; exit 1
    fi
    layered=0; [ "$compositor" = 0 ] || layered=6
    grep -qx "layered $layered" "$tmp/log"
    grep -qx 'animation reset ok' "$tmp/log"
  done
done
