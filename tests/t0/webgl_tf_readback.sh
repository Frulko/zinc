#!/bin/sh
# Real named/default transform feedback, shared JS and typed read validation.
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_WEBGL=1 ZINC_FRAMES=1
for name in tf_readback buffer_readback; do
  for pair in 'js quickjs' 'ts interp'; do
    set -- $pair
    ext=$1
    if [ "$2" = quickjs ]; then set -- --engine quickjs; else set -- --interp; fi
    out=$(timeout 20 "$ZINC" run "tests/data/webgl/$name.$ext" "$@" 2>&1) || { echo "$out"; exit 1; }
    echo "$out"
    echo "$out" | grep -q 'readback .*: ok'
  done
done
