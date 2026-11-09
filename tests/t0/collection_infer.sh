#!/bin/sh
# Constructor inference reuses collection fill/for-of semantics and retains explicit/expected constraints.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/collection_infer/main.ts $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^collection inference: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
for fixture in empty mismatch invalid_map not_iterable expected; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/collection_infer/$fixture.ts" >"$tmp/log" 2>&1; then echo "invalid constructor accepted: $fixture"; exit 1; fi
  grep -Eq 'Z0103|Z0109' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
