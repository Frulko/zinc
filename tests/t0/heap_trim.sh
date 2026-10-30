#!/bin/sh
# The memory of freed objects goes back to the system (ZN-885): tests/data/heap_trim.ts parses a 27 MB JSON document, drops it and idles;
# 4 s later its physical footprint (macOS `footprint`, Activity Monitor's Memory) must be under 60 MB (8 MB measured). Before, mimalloc kept
# the burst's pages: 222 MB. macOS only (the footprint ledger).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] && command -v footprint >/dev/null || { echo "heap_trim: macOS only"; exit 77; }
tmp=$(mktemp -d)
trap 'kill "$pid" 2>/dev/null; rm -rf "$tmp"' EXIT
env -u ZINC_DETERMINISTIC "$ZINC" run tests/data/heap_trim.ts > "$tmp/out" 2>&1 &
pid=$!
for _ in $(seq 300); do grep -q '^parsed' "$tmp/out" && break; sleep 0.1; done
grep -q '^parsed 300000$' "$tmp/out" || { echo "heap_trim: the program did not parse"; cat "$tmp/out"; exit 1; }
sleep 4
mb=$(( $(footprint -f bytes --noCategories "$pid" | awk '{ for (i = 1; i < NF; i++) if ($i == "Footprint:") { print $(i + 1); exit } }') / 1048576 ))
[ "$mb" -lt 60 ] || { echo "heap_trim: $mb MB after the burst was dropped (at most 60)"; exit 1; }
