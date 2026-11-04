#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
${CXX:-c++} -std=c++20 -Wall -Wextra -Iruntime tests/native/gl_paint_cache.cpp -o "$tmp/check"
"$tmp/check"
