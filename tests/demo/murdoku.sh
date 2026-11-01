#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
# One long generation proof; the other engines exercise the same rules on a short sample.
"$ZINC" run tests/data/murdoku/main.ts --engine quickjs > "$tmp/out"
test "$(cat "$tmp/out")" = 'puzzles 60'
for engine in interp aot; do
 case "$engine" in interp) set -- --interp;; aot) set -- --native;; esac
 MURDOKU_SMOKE=1 "$ZINC" run tests/data/murdoku/main.ts "$@" > "$tmp/out"
 test "$(cat "$tmp/out")" = 'puzzles 6'
done
