#!/bin/sh
# Polygon keys are independent of the previously drawn polygon's contour length.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
case $(uname -s) in Darwin) dead_strip=-Wl,-dead_strip ;; *) dead_strip=-Wl,--gc-sections ;; esac
${CXX:-c++} -std=c++17 -O2 -ffunction-sections -fdata-sections -Iruntime -Iruntime/include -Iinclude tests/native/ff_shape_key.cpp "$dead_strip" -o "$tmp/check" || exit 1
"$tmp/check"
