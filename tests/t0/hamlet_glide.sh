#!/bin/sh
# Hamlet: a zoom glide (the new level baked a few ms a frame, then swapped in) equals the plain zoom step, headless; one engine is enough, the bake is slow on the interpreter.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1
"$ZINC" run tests/data/hamlet/glide.ts > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
grep -q 'hamlet glide: ALL PASS' "$tmp/out" || { cat "$tmp/out"; exit 1; }
echo 'hamlet_glide: PASS'
