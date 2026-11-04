#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"${CXX:-c++}" -std=c++20 -O2 -DZN_NO_MIMALLOC -Wall -Wextra -Wno-unknown-attributes -Iinclude -Isrc tests/unit/wasm_buffers_test.cpp -o "$tmp/test"
"$tmp/test" "$tmp/input.zbc"
