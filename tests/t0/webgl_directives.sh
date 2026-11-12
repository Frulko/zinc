#!/bin/sh
# Focused directive regression through the public provider, no conformance pages.
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_WEBGL=1 ZINC_FRAMES=1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
c++ -std=c++20 -Wall -Wextra -Isrc tests/data/webgl/directives_mask.cpp -o "$tmp/mask"
timeout 10 "$tmp/mask"
out=$(timeout 20 "$ZINC" run tests/data/webgl/directives.js --engine quickjs 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q 'webgl directives JS: ok'
echo "$out"
out=$(timeout 20 "$ZINC" run tests/data/webgl/directives.ts --interp 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q 'webgl directives typed: ok'
echo "$out"
