#!/bin/sh
# Hamlet: nothing stands, spawns, regrows or walks on the void border or off the grid (many seeds, sizes, presets, days of play); the hash line is the same on three engines.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_AUDIO=null ZINC_DETERMINISTIC=1 ZINC_FRAMES=1
"$ZINC" run tests/data/hamlet/bounds.ts > "$tmp/a" 2> "$tmp/ea" &       # the three engines run at once: the test lasts as long as the slowest
"$ZINC" run --interp tests/data/hamlet/bounds.ts > "$tmp/b" 2> "$tmp/eb" &
"$ZINC" run tests/data/hamlet/bounds.ts --engine quickjs > "$tmp/c" 2> "$tmp/ec" &
wait
for f in ea eb ec; do [ ! -s "$tmp/$f" ] || { cat "$tmp/$f"; exit 1; }; done
for f in a b c; do grep -q 'hamlet bounds: ALL PASS' "$tmp/$f" || { cat "$tmp/$f"; exit 1; }; done
[ "$(grep 'hash' "$tmp/a")" = "$(grep 'hash' "$tmp/b")" ] && [ "$(grep 'hash' "$tmp/a")" = "$(grep 'hash' "$tmp/c")" ] || { echo 'hamlet_bounds: the hash differs between engines'; grep hash "$tmp/a" "$tmp/b" "$tmp/c"; exit 1; }
echo 'hamlet_bounds: PASS'
