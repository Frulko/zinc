#!/bin/sh
# Flex reverses hidden through class writes and real headless surface breakpoint changes.
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=1080x360 ZINC_FRAMES=12 ZINC_INPUT="$PWD/tests/data/ui_display/rotate.input" timeout 40 "$ZINC" run tests/data/ui_display/main.ts $engine >"$tmp/log" 2>&1; then
    cat "$tmp/log"; exit 1
  fi
  grep -qx 'responsive display: ok' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
echo 'responsive display: ok'
