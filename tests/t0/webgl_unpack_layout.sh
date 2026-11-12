#!/bin/sh
# Client-view UNPACK spans and the already-packed DOM upload boundary.
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_WEBGL=1 ZINC_WEB=1 ZINC_FRAMES=1
for pair in 'js quickjs' 'ts interp'; do
  set -- $pair
  ext=$1
  if [ "$2" = quickjs ]; then set -- --engine quickjs; else set -- --interp; fi
  out=$(timeout 20 "$ZINC" run "tests/data/webgl/unpack_layout.$ext" "$@" 2>&1) || { echo "$out"; exit 1; }
  echo "$out"
  echo "$out" | grep -q 'UNPACK layout .*: ok'
done
out=$(timeout 20 "$ZINC" run tests/data/webgl/unpack_offsets.js --engine quickjs 2>&1) || { echo "$out"; exit 1; }
echo "$out"
echo "$out" | grep -q 'UNPACK layout offsets: ok'
out=$(timeout 20 "$ZINC" run tests/data/webgl/unpack_limits.ts --interp 2>&1) || { echo "$out"; exit 1; }
echo "$out"
echo "$out" | grep -q 'UNPACK layout limits: ok'
