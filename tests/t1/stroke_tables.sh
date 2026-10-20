#!/bin/sh
# Stroke joins from precomputed unit circles (ZN-406): random polylines of every join size give contours bit-identical to the per-vertex
# cosf/sinf reference.
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" capture --stroke-check 5000) || { echo "stroke_tables: $out"; exit 1; }
echo "stroke_tables: ok ($out)"
