#!/bin/sh
# Nullable string keys use existing equality, hashing and ownership on every engine.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/nullable_keys/main.ts $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^nullable keys: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  # A null key is valid; a null collection receiver still throws.
  # shellcheck disable=SC2086
  if ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/nullable_keys/null_receiver.ts $engine >"$tmp/null" 2>&1; then echo 'null collection receiver accepted'; exit 1; fi
  grep -Ei 'null|cannot.*has' "$tmp/null" >/dev/null || { cat "$tmp/null"; exit 1; }
done
ZINC_HEADLESS=1 timeout 15 "$ZINC" mem tests/data/nullable_keys/main.ts --check-leaks >"$tmp/leaks" 2>&1 || { cat "$tmp/leaks"; exit 1; }
