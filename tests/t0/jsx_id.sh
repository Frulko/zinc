#!/bin/sh
# Semantic IDs share the generic attribute store; changes preserve refs and descendant relationships.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for model in solid react; do
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_FRAMES=7 timeout 45 "$ZINC" run "tests/data/jsx_id/$model.tsx" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
    grep -q '^jsx-id: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
for fixture in invalid invalid_virtual; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/jsx_id/$fixture.tsx" >"$tmp/log" 2>&1; then echo 'unknown attribute accepted'; exit 1; fi
  grep -q Z0005 "$tmp/log"
  grep -q "unknown attribute 'stillUnknown'" "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
