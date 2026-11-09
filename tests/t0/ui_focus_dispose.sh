#!/bin/sh
# Released roots and callbacks disposed during dispatch cannot reach recycled node slots.
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
want='live:true,live:false,victim:true,dispose:true,replacement:true,replacement:false'
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/ui_focus_dispose/main.ts $engine >"$tmp/log" 2>&1; then
    cat "$tmp/log"; exit 1
  fi
  got=$(tail -1 "$tmp/log")
  [ "$got" = "$want" ] || { echo "$engine: expected '$want', got '$got'"; cat "$tmp/log"; exit 1; }
done
