#!/bin/sh
# Flex lines use the child heights at their allocated widths, including nested wraps.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=1440x1000 ZINC_FRAMES=3 timeout 60 "$ZINC" run tests/data/ui_nested_wrap/main.tsx $engine >"$tmp/log" 2>&1; then
    cat "$tmp/log"; exit 1
  fi
  grep -qx 'nested wrap ok' "$tmp/log"
done
