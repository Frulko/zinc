#!/bin/sh
# Hamlet generation: the WFC cover breaks no rule, the clustered maps hold deposits and herds in groups (Clark-Evans, share in patches, richness gradient), nothing stands on void, water or mountain rock, the scatter style is unchanged; the hash line is the same on three engines.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_AUDIO=null ZINC_DETERMINISTIC=1 ZINC_FRAMES=1
"$ZINC" run tests/data/hamlet/generation.ts > "$tmp/a" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
"$ZINC" run --interp tests/data/hamlet/generation.ts > "$tmp/b" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
"$ZINC" run tests/data/hamlet/generation.ts --engine quickjs > "$tmp/c" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
for f in a b c; do grep -q 'hamlet generation: ALL PASS' "$tmp/$f" || { cat "$tmp/$f"; exit 1; }; done
[ "$(grep 'hash' "$tmp/a")" = "$(grep 'hash' "$tmp/b")" ] && [ "$(grep 'hash' "$tmp/a")" = "$(grep 'hash' "$tmp/c")" ] || { echo 'hamlet_generation: the hash differs between engines'; grep hash "$tmp/a" "$tmp/b" "$tmp/c"; exit 1; }
echo 'hamlet_generation: PASS'
