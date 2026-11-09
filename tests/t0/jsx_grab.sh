#!/bin/sh
# Dynamic grab keeps the native policies, once-per-apply evaluation and bindings.
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for model in solid react; do
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_FRAMES=10 timeout 45 "$ZINC" run "tests/data/jsx_grab/$model.tsx" $engine >"$tmp/log" 2>&1; then
      cat "$tmp/log"; exit 1
    fi
    grep -q '^jsx-grab: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
if LANG=en timeout 15 "$ZINC" check tests/data/jsx_grab/invalid.tsx >"$tmp/log" 2>&1; then
  echo 'invalid literal grab accepted'; exit 1
fi
grep -q Z0005 "$tmp/log"
grep -q "unknown attribute 'grab' on <View>" "$tmp/log" || { cat "$tmp/log"; exit 1; }
