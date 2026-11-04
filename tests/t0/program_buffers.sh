#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"${CXX:-c++}" -std=c++20 -O2 -Wall -Wextra -Werror -DZN_NO_MIMALLOC \
  -I include -I src tests/unit/program_buffers_test.cpp src/rt/program.cpp -o "$tmp/test"
"$tmp/test"
