#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for engine in '--interp' '--native' '--engine quickjs'; do
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1000000 timeout 60 "$ZINC" run tests/data/image_cache $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^image_cache: live nodes, inline images, nested reservations, LRU and 100 navigations pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
echo 'image_cache: interpreter, AOT and QuickJS passed'
