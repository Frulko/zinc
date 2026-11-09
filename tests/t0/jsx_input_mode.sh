#!/bin/sh
# Dynamic inputMode uses the existing native enum once per apply in both JSX models.
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for model in solid react; do
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_FRAMES=12 timeout 45 "$ZINC" run "tests/data/jsx_input_mode/$model.tsx" $engine >"$tmp/log" 2>&1; then
      cat "$tmp/log"; exit 1
    fi
    grep -q '^jsx-input-mode: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
if LANG=en timeout 15 "$ZINC" check tests/data/jsx_input_mode/invalid.tsx >"$tmp/log" 2>&1; then
  echo 'invalid literal inputMode accepted'; exit 1
fi
grep -q Z0005 "$tmp/log"
grep -q "unknown attribute 'inputMode' on <Input>" "$tmp/log" || { cat "$tmp/log"; exit 1; }
