#!/bin/sh
# Hidden tabs remain idle before layout and after a visible layout; reopens use current selection.
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for model in kit-tabs-idle kit-tabs-idle-react; do
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=360x240 ZINC_FRAMES=69 timeout 45 "$ZINC" run "tests/golden/$model" $engine >"$tmp/log" 2>&1; then
      cat "$tmp/log"; exit 1
    fi
    grep -qx 'hidden tabs idle: ok' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
echo 'hidden tabs idle: ok'
