#!/bin/sh
# Tiled painting (ZN-410): tests/data/tiles (6141 commands, 1967 of them listed in tiles, clips rounded and nested, text, shadows, borders,
# gradients, polygons, strokes, moving rects) paints the same six frames through the tiles as through render() alone (ZINC_TILES=0).
cd "$(dirname "$0")/../.." || exit 2
fail=0
run() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMEHASH=all "$ZINC" run tests/data/tiles 2>&1 | grep framehash; }
a=$(run); b=$(ZINC_TILES=0 run)
[ "$(printf '%s\n' "$a" | grep -c framehash)" -eq 6 ] || { echo "tiles: expected 6 frame hashes, got: $a"; fail=1; }
[ "$a" = "$b" ] || { echo "tiled frames differ from render()'s:"; printf '%s\n--\n%s\n' "$a" "$b"; fail=1; }
exit $fail
