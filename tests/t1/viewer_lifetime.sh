#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for engine in '--interp' '--native' '--engine quickjs'; do
  ZINC_HEADLESS=1 ZINC_FRAMES=1000000 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=400x300 timeout 60 "$ZINC" run tests/data/viewer_lifetime $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^viewer_lifetime: displayed and stale sharper copies released; thumbnail preserved$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
