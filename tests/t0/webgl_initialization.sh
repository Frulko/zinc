#!/bin/sh
# Focused storage/copy regression, no conformance pages.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
${CXX:-c++} -std=c++20 -I src -I third_party/glad/include tests/native/webgl_zero_test.cpp -x c++ third_party/glad/src/gl.c -o "$tmp/zero"
"$tmp/zero"
export ZINC_HEADLESS=1 ZINC_WEBGL=1 ZINC_FRAMES=1
out=$(timeout 20 "$ZINC" run tests/data/webgl/initialization.js --engine quickjs 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q 'webgl initialization: ok' || { echo "$out"; exit 1; }
echo "$out"
