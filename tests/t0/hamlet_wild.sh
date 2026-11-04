#!/bin/sh
# Hamlet: far animals as counts (engine/wild.ts), headless; the three engines print the same summary line.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1
"$ZINC" run tests/data/hamlet/wild.ts > "$tmp/a" 2> "$tmp/err"
"$ZINC" run --interp tests/data/hamlet/wild.ts > "$tmp/b" 2>> "$tmp/err"
"$ZINC" run tests/data/hamlet/wild.ts --engine quickjs > "$tmp/c" 2>> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
for f in a b c; do grep -q 'hamlet wild: ALL PASS' "$tmp/$f" || { cat "$tmp/$f"; exit 1; }; done
grep summary "$tmp/a" > "$tmp/sa"; grep summary "$tmp/b" > "$tmp/sb"; grep summary "$tmp/c" > "$tmp/sc"
cmp "$tmp/sa" "$tmp/sb" && cmp "$tmp/sa" "$tmp/sc" || { echo 'engines differ'; cat "$tmp/sa" "$tmp/sb" "$tmp/sc"; exit 1; }
echo 'hamlet_wild: PASS'
